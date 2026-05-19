import useReveal from '../hooks/useReveal';

// -- DAG layout --------------------------------------------------------------
// Coordinates live in a 1200x1620 SVG viewBox. Nodes are 220x78. All edges are
// computed as Bezier curves between bottom-center → top-center of source/target,
// so adding/moving a node only requires updating its (x,y).

const NODE_W = 220;
const NODE_H = 78;

type Layer = 'bronze' | 'silver' | 'gold' | 'gold-dim' | 'ml' | 'serve';

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
  { id: 'train',    name: 'ml_train_cardio_classifier',   sub: 'XGBoost · Optuna',          layer: 'ml',    x: 490, y: 980 },
  { id: 'promote',  name: 'ml_promote_cardio_classifier', sub: 'champion · challenger',     layer: 'ml',    x: 490, y: 1150 },
  { id: 'serve',    name: 'ml_serve_cardio_classifier',   sub: 'endpoint REST · serving',   layer: 'serve', x: 490, y: 1320 },
];

const EDGES: [string, string][] = [
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

function edgePath(a: TaskNode, b: TaskNode): string {
  const x1 = a.x + NODE_W / 2;
  const y1 = a.y + NODE_H;
  const x2 = b.x + NODE_W / 2;
  const y2 = b.y;
  if (Math.abs(x1 - x2) < 1) return `M${x1},${y1} L${x2},${y2 - 8}`;
  // Smooth S-curve via cubic bezier, control points at the vertical midpoint.
  const dy = y2 - y1;
  const cy1 = y1 + dy * 0.55;
  const cy2 = y2 - dy * 0.55;
  return `M${x1},${y1} C${x1},${cy1} ${x2},${cy2} ${x2},${y2 - 8}`;
}

// Layer → icon (24x24 viewBox). Drawn inside each node card.
function LayerIcon({ layer }: { layer: Layer }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (layer) {
    case 'bronze':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          <path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" />
        </svg>
      );
    case 'silver':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M3 12c3-5 7-7 9-7s6 2 9 7c-3 5-7 7-9 7s-6-2-9-7z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case 'gold':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      );
    case 'gold-dim':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case 'ml':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="5" cy="6" r="2" />
          <circle cx="5" cy="18" r="2" />
          <circle cx="19" cy="12" r="2" />
          <path d="M7 6l10 5M7 18l10-5" />
        </svg>
      );
    case 'serve':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M5 12c0-4 3-7 7-7s7 3 7 7" />
          <path d="M12 12l4 4M12 22l8-8" />
          <circle cx="12" cy="12" r="2" />
        </svg>
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

function DagNode({ node }: { node: TaskNode }) {
  const cls = `dag-node layer-${node.layer}`;
  return (
    <g className={cls} transform={`translate(${node.x},${node.y})`}>
      <rect className="node-bg"      width={NODE_W} height={NODE_H} rx="14" />
      <rect className="node-bar"     width="4"      height={NODE_H} rx="2"  x="0" y="0" />
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
    </g>
  );
}

// -- Section labels (drawn inside the SVG, vertically aligned with the dag) --
function PhaseLabel({ y, eyebrow, title }: { y: number; eyebrow: string; title: string }) {
  return (
    <g transform={`translate(40, ${y})`}>
      <text className="phase-eyebrow">{eyebrow}</text>
      <text className="phase-title" y={26}>{title}</text>
    </g>
  );
}

export default function Pipeline() {
  useReveal([]);

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
        <div className="dag-wrapper glass reveal">
          <svg
            className="dag-svg"
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

              <filter id="dag-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Phase 1 -------------------------------------------------- */}
            <PhaseLabel y={40}  eyebrow="JOB 1"  title="cardio_data_pipeline" />

            {/* Edges first so they render behind the cards */}
            <g className="edges">
              {EDGES.map(([from, to]) => (
                <path
                  key={`${from}->${to}`}
                  className="edge"
                  d={edgePath(NODE_BY_ID[from], NODE_BY_ID[to])}
                  markerEnd="url(#dag-arrow)"
                />
              ))}
            </g>

            {/* Nodes */}
            <g className="nodes">
              {NODES.map((n) => (
                <DagNode key={n.id} node={n} />
              ))}
            </g>

            {/* Bridge annotation: features feeds the ML pipeline ------- */}
            <g transform="translate(230, 838)" className="bridge-note">
              <rect width="320" height="36" rx="18" />
              <text x="160" y="23">cardio_features · entrada del modelo</text>
            </g>

            {/* Phase 2 -------------------------------------------------- */}
            <PhaseLabel y={900} eyebrow="JOB 2"  title="cardio_ml_pipeline" />

            {/* Endpoint annotation -------------------------------------- */}
            <g transform="translate(740, 1340)" className="bridge-note serve-note">
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
