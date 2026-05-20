import { useMemo, useState } from 'react';
import type { MappedRow } from '../lib/batchMap';
import type { BatchResult } from '../api';
import { serializeCSV } from '../lib/csv';

interface Props {
  rows:      MappedRow[];        // input rows (already filtered to payload != null)
  results:   BatchResult[];      // 1:1 with rows
  elapsedMs: number;
  filename:  string;
  onReset:   () => void;
}

type SortKey = 'id' | 'age' | 'sex' | 'bp' | 'bmi' | 'probability' | 'prediction';
type Dir = 'asc' | 'desc';

const PAGE_SIZE = 50;

interface CombinedRow {
  input:  MappedRow;
  result: BatchResult;
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function tsStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export default function BatchResults({ rows, results, elapsedMs, filename, onReset }: Props) {
  const combined: CombinedRow[] = useMemo(
    () => rows.map((r, i) => ({ input: r, result: results[i] })),
    [rows, results],
  );

  // ----- KPIs ---------------------------------------------------------------
  const total       = combined.length;
  const positives   = combined.filter((c) => c.result.prediction === 1).length;
  const positivePct = total ? (positives / total) * 100 : 0;
  const avgProb     = total ? combined.reduce((s, c) => s + c.result.probability, 0) / total : 0;

  // ----- Sorting ------------------------------------------------------------
  const [sortKey, setSortKey] = useState<SortKey>('probability');
  const [sortDir, setSortDir] = useState<Dir>('desc');

  const sorted = useMemo(() => {
    const arr = combined.slice();
    const get = (c: CombinedRow): number | string => {
      switch (sortKey) {
        case 'id':          return c.input.id;
        case 'age':         return c.input.payload!.age_years;
        case 'sex':         return c.input.payload!.gender;
        case 'bp':          return c.input.payload!.systolic_bp;
        case 'bmi':         return c.input.payload!.bmi;
        case 'probability': return c.result.probability;
        case 'prediction':  return c.result.prediction;
      }
    };
    arr.sort((a, b) => {
      const va = get(a); const vb = get(b);
      if (va < vb) return sortDir === 'asc' ? -1 :  1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });
    return arr;
  }, [combined, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir(k === 'id' || k === 'age' ? 'asc' : 'desc');
    }
  };

  // ----- Pagination ---------------------------------------------------------
  const [page, setPage] = useState(0);
  const pages    = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const start    = safePage * PAGE_SIZE;
  const visible  = sorted.slice(start, start + PAGE_SIZE);

  // ----- CSV export ---------------------------------------------------------
  const downloadResults = () => {
    const header = ['id', 'age_years', 'gender', 'height_cm', 'weight_kg', 'bmi',
                    'systolic_bp', 'diastolic_bp', 'cholesterol', 'gluc',
                    'is_smoker', 'drinks_alcohol', 'is_physically_active',
                    'probability', 'prediction'];
    const body = sorted.map((c) => {
      const p = c.input.payload!;
      return [
        c.input.id,
        p.age_years, p.gender, p.height_cm, p.weight_kg, p.bmi,
        p.systolic_bp, p.diastolic_bp, p.cholesterol, p.gluc,
        p.is_smoker, p.drinks_alcohol, p.is_physically_active,
        c.result.probability.toFixed(6),
        c.result.prediction,
      ];
    });
    downloadBlob(`cardiac_predictions_${tsStamp()}.csv`, serializeCSV([header, ...body]), 'text/csv');
  };

  // ----- Render -------------------------------------------------------------
  return (
    <div className="batch-results">
      {/* KPI strip */}
      <div className="batch-kpi-grid">
        <KpiCard
          eyebrow="Total procesados"
          value={total.toLocaleString('es')}
          sub={filename}
          tone="neutral"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          }
        />
        <KpiCard
          eyebrow="Con indicios"
          value={positives.toLocaleString('es')}
          sub={`${positivePct.toFixed(1)}% del total`}
          tone={positivePct >= 30 ? 'bad' : 'ok'}
          icon={
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21s-7-4.5-9.5-9C0.5 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4 4.5 8-2.5 4.5-9.5 9-9.5 9z" />
            </svg>
          }
        />
        <KpiCard
          eyebrow="Probabilidad promedio"
          value={avgProb.toFixed(3)}
          sub={`media de ${total.toLocaleString('es')} pacientes`}
          tone="neutral"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 4 4 5-5" />
            </svg>
          }
        />
        <KpiCard
          eyebrow="Tiempo de respuesta"
          value={`${(elapsedMs / 1000).toFixed(1)}s`}
          sub="endpoint Databricks"
          tone="neutral"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          }
        />
      </div>

      {/* Table */}
      <div className="batch-table-card glass">
        <header className="batch-table-head">
          <div>
            <h3>Resultados</h3>
            <p>Ordenado por <strong>{sortLabel(sortKey)}</strong> {sortDir === 'asc' ? '↑' : '↓'}</p>
          </div>
          <div className="batch-table-actions">
            <button type="button" className="btn btn-ghost" onClick={onReset}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 109-9" />
                <path d="M3 3v6h6" />
              </svg>
              Cargar otro lote
            </button>
            <button type="button" className="btn btn-primary" onClick={downloadResults}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12M7 10l5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
              Descargar CSV
            </button>
          </div>
        </header>

        <div className="batch-table-wrap">
          <table className="batch-table">
            <thead>
              <tr>
                <Th label="#"            k="id"          sortKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <Th label="edad"         k="age"         sortKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <Th label="sexo"         k="sex"         sortKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <Th label="pres."        k="bp"          sortKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <Th label="BMI"          k="bmi"         sortKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <Th label="probabilidad" k="probability" sortKey={sortKey} dir={sortDir} onSort={toggleSort} className="th-prob" />
                <Th label="diagnóstico"  k="prediction"  sortKey={sortKey} dir={sortDir} onSort={toggleSort} className="th-diag" />
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const p = c.input.payload!;
                const pct = Math.round(c.result.probability * 100);
                return (
                  <tr key={c.input.rowIndex}>
                    <td className="cell-id">{c.input.id}</td>
                    <td>{p.age_years}</td>
                    <td>{p.gender === 1 ? 'F' : 'M'}</td>
                    <td className="cell-bp">{p.systolic_bp}<span className="bp-slash">/</span>{p.diastolic_bp}</td>
                    <td>{p.bmi}</td>
                    <td className="cell-prob">
                      <div className="prob-bar">
                        <div className="prob-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="prob-num">{c.result.probability.toFixed(3)}</span>
                    </td>
                    <td className="cell-diag">
                      <span className={`diag-pill ${c.result.prediction === 1 ? 'pos' : 'neg'}`}>
                        <span className="diag-dot" />
                        {c.result.prediction === 1 ? 'Indicios' : 'Sin indicios'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <footer className="batch-pagination">
            <span>
              Mostrando {(start + 1).toLocaleString('es')}–{Math.min(start + PAGE_SIZE, total).toLocaleString('es')}
              {' '}de {total.toLocaleString('es')}
            </span>
            <div className="page-buttons">
              <button type="button" className="btn btn-ghost" disabled={safePage === 0}        onClick={() => setPage(safePage - 1)}>← Anterior</button>
              <span className="page-num">Página {safePage + 1} / {pages}</span>
              <button type="button" className="btn btn-ghost" disabled={safePage === pages - 1} onClick={() => setPage(safePage + 1)}>Siguiente →</button>
            </div>
          </footer>
        )}
      </div>

      <p className="batch-disclaimer">
        ⚕️ Modelo de screening con fines educativos · no sustituye un diagnóstico médico.
      </p>
    </div>
  );
}

// ---- Helpers ---------------------------------------------------------------

function sortLabel(k: SortKey): string {
  switch (k) {
    case 'id':          return 'id';
    case 'age':         return 'edad';
    case 'sex':         return 'sexo';
    case 'bp':          return 'presión';
    case 'bmi':         return 'BMI';
    case 'probability': return 'probabilidad';
    case 'prediction':  return 'diagnóstico';
  }
}

interface ThProps {
  label: string; k: SortKey; sortKey: SortKey; dir: Dir;
  onSort: (k: SortKey) => void; className?: string;
}
function Th({ label, k, sortKey, dir, onSort, className }: ThProps) {
  const active = sortKey === k;
  return (
    <th className={(className || '') + (active ? ' is-active' : '')} onClick={() => onSort(k)}>
      <span>{label}</span>
      <span className="th-arrow" aria-hidden>{active ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  );
}

interface KpiProps {
  eyebrow: string; value: string; sub: string; tone: 'ok' | 'bad' | 'neutral'; icon: React.ReactNode;
}
function KpiCard({ eyebrow, value, sub, tone, icon }: KpiProps) {
  return (
    <div className={`batch-kpi-card glass tone-${tone}`}>
      <div className="batch-kpi-icon">{icon}</div>
      <div className="batch-kpi-content">
        <div className="batch-kpi-eyebrow">{eyebrow}</div>
        <div className="batch-kpi-value">{value}</div>
        <div className="batch-kpi-sub">{sub}</div>
      </div>
    </div>
  );
}
