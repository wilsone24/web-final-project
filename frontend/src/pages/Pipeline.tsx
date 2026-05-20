import { useEffect, useMemo, useRef, useState } from 'react';
import useReveal from '../hooks/useReveal';

// -- DAG layout --------------------------------------------------------------
// Coordinates live in a 1200x1480 SVG viewBox. Nodes are 220x78. All edges are
// computed as Bezier curves between bottom-center → top-center of source/target,
// so adding/moving a node only requires updating its (x,y).

const NODE_W = 220;
const NODE_H = 78;

type Layer = 'bronze' | 'silver' | 'gold' | 'gold-dim' | 'ml' | 'serve';
type RunStatus = 'idle' | 'running' | 'success';

interface TaskNode {
  id: string;
  name: string;       // task_key as it appears in the Databricks job YAML
  sub: string;        // small caption shown under the name
  layer: Layer;
  x: number;
  y: number;
}

const NODES: TaskNode[] = [
  // -- cardio_data_pipeline --------------------------------------------------
  { id: 'ingest',   name: 'ingest_cardio_patients',  sub: 'CSV → Delta',           layer: 'bronze',   x: 490, y: 120 },
  { id: 'clean',    name: 'clean_cardio_patients',   sub: 'SCD-2 · outliers',      layer: 'silver',   x: 490, y: 290 },
  { id: 'fct',      name: 'fct_cardio_outcomes',     sub: 'star schema · fact',    layer: 'gold',     x: 490, y: 460 },
  { id: 'features', name: 'cardio_features',         sub: 'tabla ML',              layer: 'gold',     x:  30, y: 660 },
  { id: 'age',      name: 'dim_age_group',           sub: 'dimensión',             layer: 'gold-dim', x: 260, y: 660 },
  { id: 'gender',   name: 'dim_gender',              sub: 'dimensión',             layer: 'gold-dim', x: 490, y: 660 },
  { id: 'chol',     name: 'dim_cholesterol',         sub: 'dimensión',             layer: 'gold-dim', x: 720, y: 660 },
  { id: 'gluc',     name: 'dim_glucose',             sub: 'dimensión',             layer: 'gold-dim', x: 950, y: 660 },
  // -- cardio_ml_pipeline ----------------------------------------------------
  { id: 'train',    name: 'ml_train_cardio',   sub: 'XGBoost · Optuna',          layer: 'ml',    x: 490, y: 980 },
  { id: 'promote',  name: 'ml_promote_cardio', sub: 'champion · challenger',     layer: 'ml',    x: 490, y: 1150 },
  { id: 'serve',    name: 'ml_serve_cardio',   sub: 'endpoint REST · serving',   layer: 'serve', x: 490, y: 1320 },
];

const EDGES: Array<[string, string]> = [
  ['ingest',  'clean'],
  ['clean',   'fct'],
  ['fct',     'features'],
  ['fct',     'age'],
  ['fct',     'gender'],
  ['fct',     'chol'],
  ['fct',     'gluc'],
  ['features','train'],
  ['train',   'promote'],
  ['promote', 'serve'],
];

const NODE_BY_ID: Record<string, TaskNode> = Object.fromEntries(NODES.map((n) => [n.id, n]));
const EDGE_ID = (from: string, to: string) => `${from}->${to}`;

// -- Run-simulation schedule (in seconds; cycle = 12s) ----------------------
const SCHEDULE: Record<string, [number, number]> = {
  ingest:   [0,    1.5],
  clean:    [1.5,  3.0],
  fct:      [3.0,  4.5],
  features: [4.5,  6.0],
  age:      [4.5,  6.0],
  gender:   [4.5,  6.0],
  chol:     [4.5,  6.0],
  gluc:     [4.5,  6.0],
  train:    [6.0,  7.5],
  promote:  [7.5,  9.0],
  serve:    [9.0,  10.5],
};
const CYCLE_S = 12;

function statusAt(id: string, t: number): RunStatus {
  const [start, end] = SCHEDULE[id];
  if (t < start) return 'idle';
  if (t < end)   return 'running';
  return 'success';
}

// Edge state: emits a "live" pulse on the particle when data is flowing
// (i.e. the upstream node has just finished and the downstream is running/done).
function edgeActiveAt(from: string, to: string, t: number): boolean {
  const fromS = statusAt(from, t);
  const toS   = statusAt(to,   t);
  return fromS === 'success' && (toS === 'running' || toS === 'success');
}

// -- Lineage (upstream + downstream) -----------------------------------------
function computeLineage(rootId: string) {
  const nodes = new Set<string>([rootId]);
  const edges = new Set<string>();

  // Upstream
  const up: string[] = [rootId];
  while (up.length) {
    const cur = up.pop()!;
    for (const [from, to] of EDGES) {
      if (to === cur && !nodes.has(from)) {
        nodes.add(from);
        edges.add(EDGE_ID(from, to));
        up.push(from);
      } else if (to === cur) {
        edges.add(EDGE_ID(from, to));
      }
    }
  }

  // Downstream
  const down: string[] = [rootId];
  while (down.length) {
    const cur = down.pop()!;
    for (const [from, to] of EDGES) {
      if (from === cur && !nodes.has(to)) {
        nodes.add(to);
        edges.add(EDGE_ID(from, to));
        down.push(to);
      } else if (from === cur) {
        edges.add(EDGE_ID(from, to));
      }
    }
  }

  return { nodes, edges };
}

// -- Geometry helpers --------------------------------------------------------
function edgePath(a: TaskNode, b: TaskNode): string {
  const x1 = a.x + NODE_W / 2;
  const y1 = a.y + NODE_H;
  const x2 = b.x + NODE_W / 2;
  const y2 = b.y;
  if (Math.abs(x1 - x2) < 1) return `M${x1},${y1} L${x2},${y2 - 8}`;
  const dy = y2 - y1;
  const cy1 = y1 + dy * 0.55;
  const cy2 = y2 - dy * 0.55;
  return `M${x1},${y1} C${x1},${cy1} ${x2},${cy2} ${x2},${y2 - 8}`;
}

// -- Layer → icon. Returns a <g> with paths in a 24x24 coordinate space, ----
// drawn directly into the parent SVG (no nested <svg> — those would need
// explicit width/height to render).
function LayerIcon({ layer }: { layer: Layer }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (layer) {
    case 'bronze':
      return (
        <g {...common}>
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          <path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" />
        </g>
      );
    case 'silver':
      return (
        <g {...common}>
          <path d="M3 12c3-5 7-7 9-7s6 2 9 7c-3 5-7 7-9 7s-6-2-9-7z" />
          <circle cx="12" cy="12" r="2.5" />
        </g>
      );
    case 'gold':
      return (
        <g {...common}>
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </g>
      );
    case 'gold-dim':
      return (
        <g {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </g>
      );
    case 'ml':
      return (
        <g {...common}>
          <circle cx="5" cy="6" r="2" />
          <circle cx="5" cy="18" r="2" />
          <circle cx="19" cy="12" r="2" />
          <path d="M7 6l10 5M7 18l10-5" />
        </g>
      );
    case 'serve':
      return (
        <g {...common}>
          <path d="M5 12c0-4 3-7 7-7s7 3 7 7" />
          <path d="M12 12l4 4M12 22l8-8" />
          <circle cx="12" cy="12" r="2" />
        </g>
      );
  }
}

const LAYER_LABEL: Record<Layer, string> = {
  bronze: 'BRONZE',
  silver: 'SILVER',
  gold:   'GOLD',
  'gold-dim': 'DIM',
  ml:     'ML',
  serve:  'SERVE',
};

// -- DAG node ----------------------------------------------------------------
interface DagNodeProps {
  node: TaskNode;
  index: number;
  status: RunStatus;
  lineageDim: boolean;
  revealed: boolean;
  staggerActive: boolean;
  onHover: (id: string | null) => void;
}

function DagNode({ node, index, status, lineageDim, revealed, staggerActive, onHover }: DagNodeProps) {
  const cls =
    `dag-node layer-${node.layer}` +
    (status !== 'idle' ? ` run-${status}` : '') +
    (lineageDim ? ' lineage-dim' : '');

  const opacity = revealed ? (lineageDim ? 0.18 : 1) : 0;
  const transitionDelay = staggerActive && revealed && !lineageDim ? `${index * 70}ms` : '0ms';

  return (
    <g
      className={cls}
      transform={`translate(${node.x},${node.y})`}
      style={{ opacity, transitionDelay }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
    >
      <rect className="node-bg"  width={NODE_W} height={NODE_H} rx="14" />
      {/* Left accent bar clipped to the card's rounded shape so its top/bottom
          corners follow the rx=14 curve instead of sticking out as a sharp tab. */}
      <rect className="node-bar" width="5" height={NODE_H} clipPath="url(#node-clip)" />
      <g transform="translate(18, 22)" className="node-icon">
        <rect width="34" height="34" rx="9" className="node-icon-bg" />
        <g transform="translate(5, 5)" className="node-icon-svg">
          <LayerIcon layer={node.layer} />
        </g>
      </g>
      <text x="62" y="44" className="node-name">{node.name}</text>
      <text x="62" y="62" className="node-sub">{node.sub}</text>
      <g transform={`translate(${NODE_W - 76}, 14)`}>
        <rect width="62" height="18" rx="9" className="node-pill" />
        <text x="31" y="13" className="node-pill-text">{LAYER_LABEL[node.layer]}</text>
      </g>

      {/* Success check badge (bottom-right corner) */}
      {status === 'success' && (
        <g className="status-check" transform={`translate(${NODE_W - 26}, ${NODE_H - 26})`}>
          <circle cx="9" cy="9" r="9" />
          <path d="M5 9.5 L8 12.5 L13.5 6.5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {/* Running spinner dot */}
      {status === 'running' && (
        <g className="status-running-dot" transform={`translate(${NODE_W - 18}, ${NODE_H - 18})`}>
          <circle cx="0" cy="0" r="5" />
        </g>
      )}
    </g>
  );
}

function PhaseLabel({ y, eyebrow, title }: { y: number; eyebrow: string; title: string }) {
  return (
    <g transform={`translate(40, ${y})`}>
      <text className="phase-eyebrow">{eyebrow}</text>
      <text className="phase-title" y={26}>{title}</text>
    </g>
  );
}

// -- Page --------------------------------------------------------------------
export default function Pipeline() {
  useReveal([]);

  // -- Run simulation: tick a wall-clock cycle of CYCLE_S seconds, mod it ---
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const sec = ((now - start) / 1000) % CYCLE_S;
      setT(sec);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // -- Hover lineage ----------------------------------------------------------
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const lineage = useMemo(() => (hoveredId ? computeLineage(hoveredId) : null), [hoveredId]);

  // -- Reveal-on-scroll ------------------------------------------------------
  // `revealed` flips on first intersection. `staggerActive` stays true only
  // long enough for the cascading entry to finish — after that, hover/un-hover
  // transitions snap immediately (no per-element delays).
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [staggerActive, setStaggerActive] = useState(true);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) { setRevealed(true); return; }
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setRevealed(true); io.disconnect(); } },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!revealed) return;
    // Reveal finishes once the slowest staggered element (last particle) has
    // animated in. Then we lock stagger off so hover transitions are instant.
    const totalMs = 1000 + EDGES.length * 80 + 600;
    const timer = window.setTimeout(() => setStaggerActive(false), totalMs);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  // Particles delay so they're spaced out across edges.
  const edgeMeta = EDGES.map(([from, to], i) => {
    const a = NODE_BY_ID[from];
    const b = NODE_BY_ID[to];
    const id = EDGE_ID(from, to);
    return {
      id,
      from,
      to,
      i,
      d: edgePath(a, b),
      live: edgeActiveAt(from, to, t),
      lineageDim: lineage ? !lineage.edges.has(id) : false,
    };
  });

  return (
    <main className="predict-page">
      <div className="container">
        {/* Header ---------------------------------------------------------- */}
        <div className="section-head reveal">
          <span className="eyebrow">Orquestación · Databricks Jobs</span>
          <h2>DAG end-to-end</h2>
          <p className="lead">
            El job <code>cardio_end_to_end</code> se ejecuta cada día a las 09:30 (BOG) y
            encadena el pipeline de datos y el pipeline de ML. Cada nodo es un notebook de
            Databricks; las flechas muestran el flujo real definido en los YAMLs del job.
          </p>
          <p className="dag-hint">
            <span className="hint-dot" /> Hover sobre cualquier tarea para resaltar su linaje (upstream + downstream).
          </p>
        </div>

        {/* Orchestrator banner -------------------------------------------- */}
        <div className="orchestrator-card glass reveal">
          <div className="orch-left">
            <span className="orch-dot" />
            <div>
              <div className="orch-name">cardio_end_to_end</div>
              <div className="orch-sub">orquestador maestro · cron Quartz <code>16 30 9 * * ?</code></div>
            </div>
          </div>
          <div className="orch-meta">
            <span className="orch-chip">⏰ 09:30 · America/Bogota</span>
            <span className="orch-chip">📅 daily</span>
            <span className="orch-chip">✉ email on_start · on_failure</span>
          </div>
        </div>

        {/* DAG visualisation --------------------------------------------- */}
        <div className="dag-wrapper glass reveal" ref={wrapRef}>
          <svg
            className={`dag-svg${revealed ? ' is-revealed' : ''}`}
            viewBox="0 0 1200 1480"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="DAG del pipeline cardio_end_to_end"
          >
            <defs>
              <marker
                id="dag-arrow"
                viewBox="0 0 12 12"
                refX="6"
                refY="6"
                markerWidth="9"
                markerHeight="9"
                orient="auto-start-reverse"
              >
                <path d="M2,2 L10,6 L2,10 Z" fill="var(--c-cvd)" />
              </marker>
              {/* Shared clip path so every node-bar inherits the card's rounded corners */}
              <clipPath id="node-clip">
                <rect width={NODE_W} height={NODE_H} rx="14" />
              </clipPath>
            </defs>

            {/* Phase 1 -------------------------------------------------- */}
            <PhaseLabel y={40}  eyebrow="JOB 1"  title="cardio_data_pipeline" />

            {/* Edges (paths) — render before nodes so they sit behind */}
            <g className="edges">
              {edgeMeta.map((e) => (
                <path
                  key={e.id}
                  className={
                    'edge' +
                    (e.lineageDim ? ' lineage-dim' : '') +
                    (e.live ? ' edge-live' : '')
                  }
                  d={e.d}
                  markerEnd="url(#dag-arrow)"
                  style={{ transitionDelay: staggerActive && revealed && !e.lineageDim ? `${0.85 + e.i * 0.08}s` : '0ms' }}
                />
              ))}
            </g>

            {/* Particles — one <circle> per edge, travelling along the path */}
            <g className="edge-particles">
              {edgeMeta.map((e) => (
                <circle
                  key={e.id}
                  r="4"
                  className={
                    'edge-particle' +
                    (e.lineageDim ? ' lineage-dim' : '') +
                    (e.live ? ' is-live' : '')
                  }
                  style={{ transitionDelay: staggerActive && revealed && !e.lineageDim ? `${1.0 + e.i * 0.08}s` : '0ms' }}
                >
                  <animateMotion
                    dur={`${1.6 + (e.i % 3) * 0.25}s`}
                    repeatCount="indefinite"
                    path={e.d}
                    begin={`${(e.i * 0.18) % 1.8}s`}
                    rotate="auto"
                  />
                </circle>
              ))}
            </g>

            {/* Nodes */}
            <g className="nodes">
              {NODES.map((n, i) => (
                <DagNode
                  key={n.id}
                  node={n}
                  index={i}
                  status={statusAt(n.id, t)}
                  lineageDim={lineage ? !lineage.nodes.has(n.id) : false}
                  revealed={revealed}
                  staggerActive={staggerActive}
                  onHover={setHoveredId}
                />
              ))}
            </g>

            {/* Bridge annotation: features feeds the ML pipeline ------- */}
            <g
              transform="translate(230, 838)"
              className="bridge-note"
              style={{ opacity: revealed ? 1 : 0, transitionDelay: staggerActive && revealed ? '2.0s' : '0ms' }}
            >
              <rect width="320" height="36" rx="18" />
              <text x="160" y="23">cardio_features · entrada del modelo</text>
            </g>

            {/* Phase 2 -------------------------------------------------- */}
            <PhaseLabel y={900} eyebrow="JOB 2"  title="cardio_ml_pipeline" />

            {/* Endpoint annotation -------------------------------------- */}
            <g
              transform="translate(740, 1340)"
              className="bridge-note serve-note"
              style={{ opacity: revealed ? 1 : 0, transitionDelay: staggerActive && revealed ? '2.3s' : '0ms' }}
            >
              <rect width="320" height="42" rx="21" />
              <text x="160" y="26">cardio-classifier-endpoint</text>
            </g>
          </svg>
        </div>

        {/* Legend --------------------------------------------------------- */}
        <div className="dag-legend reveal">
          <div className="legend-item"><span className="legend-swatch sw-bronze"   /> Bronze · raw ingest</div>
          <div className="legend-item"><span className="legend-swatch sw-silver"   /> Silver · clean + SCD-2</div>
          <div className="legend-item"><span className="legend-swatch sw-gold"     /> Gold · fact &amp; features</div>
          <div className="legend-item"><span className="legend-swatch sw-gold-dim" /> Gold · dimensiones</div>
          <div className="legend-item"><span className="legend-swatch sw-ml"       /> ML · train + promote</div>
          <div className="legend-item"><span className="legend-swatch sw-serve"    /> Serving · endpoint REST</div>
        </div>
      </div>
    </main>
  );
}
