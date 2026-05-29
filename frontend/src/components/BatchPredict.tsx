import { useCallback, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { parseCSV } from '../lib/csv';
import {
  mapCSV, getMissingRequiredColumns, buildTemplateCSV,
  type MappedCSV, type MappedRow,
} from '../lib/batchMap';
import { fetchPredictionBatch, type BatchResult } from '../api';
import BatchResults from './BatchResults';
import type { PredictionPayload } from '../types';

type Phase = 'idle' | 'parsed' | 'loading' | 'done' | 'error';

const MAX_ROWS = 5000;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB hard cap

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function BatchPredict() {
  const [phase,     setPhase]     = useState<Phase>('idle');
  const [filename,  setFilename]  = useState<string>('');
  const [parsed,    setParsed]    = useState<MappedCSV | null>(null);
  const [results,   setResults]   = useState<BatchResult[]>([]);
  const [validRows, setValidRows] = useState<MappedRow[]>([]);
  const [error,     setError]     = useState<string>('');
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [dragOver,  setDragOver]  = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ----- File handling ------------------------------------------------------

  const handleFile = useCallback(async (file: File) => {
    setError('');
    setResults([]);
    if (file.size > MAX_BYTES) {
      setError(`El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB · máximo permitido ${(MAX_BYTES / 1024 / 1024)} MB.`);
      setPhase('error');
      return;
    }

    try {
      const text = await file.text();
      const grid = parseCSV(text);
      if (grid.length < 2) throw new Error('El CSV está vacío o solo tiene encabezados.');

      const headers  = grid[0];
      const dataRows = grid.slice(1);
      if (dataRows.length > MAX_ROWS) {
        throw new Error(`Demasiadas filas: ${dataRows.length.toLocaleString('es')}. Tope: ${MAX_ROWS.toLocaleString('es')}.`);
      }

      const mapped  = mapCSV(headers, dataRows);
      const missing = getMissingRequiredColumns(mapped.columnMap);
      if (missing.length > 0) {
        throw new Error(`Faltan columnas requeridas en el CSV: ${missing.join(', ')}.`);
      }

      setFilename(file.name);
      setParsed(mapped);
      setPhase('parsed');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, []);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const downloadTemplate = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadBlob('cardiac_template.csv', buildTemplateCSV(), 'text/csv');
  };

  // ----- Run the batch ------------------------------------------------------

  const runBatch = async () => {
    if (!parsed) return;
    const valid = parsed.rows.filter((r) => r.payload !== null);
    if (valid.length === 0) {
      setError('No hay filas válidas que enviar.');
      return;
    }
    setError('');
    setValidRows(valid);
    setPhase('loading');
    const t0 = performance.now();
    try {
      const payloads = valid.map((r) => r.payload!) as PredictionPayload[];
      const out      = await fetchPredictionBatch(payloads);
      setResults(out);
      setElapsedMs(performance.now() - t0);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  const reset = () => {
    setPhase('idle');
    setParsed(null);
    setResults([]);
    setValidRows([]);
    setError('');
    setFilename('');
    setElapsedMs(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ----- Render -------------------------------------------------------------

  if (phase === 'done') {
    return (
      <BatchResults
        rows={validRows}
        results={results}
        elapsedMs={elapsedMs}
        filename={filename}
        onReset={reset}
      />
    );
  }

  const invalidCount = parsed ? parsed.rows.length - parsed.rows.filter((r) => r.payload).length : 0;
  const validCount   = parsed ? parsed.rows.length - invalidCount : 0;

  return (
    <div className="batch-card glass">
      {/* IDLE / drop zone --------------------------------------------------- */}
      {phase === 'idle' && (
        <div
          className={`batch-drop${dragOver ? ' is-drag' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onChange}
            style={{ display: 'none' }}
          />
          <div className="batch-drop-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M12 18v-6M9 15l3-3 3 3" />
            </svg>
          </div>
          <h3>Arrastra tu CSV o haz clic</h3>
          <p className="batch-drop-hint">
            Hasta <strong>{MAX_ROWS.toLocaleString('es')}</strong> pacientes · ≤ {(MAX_BYTES / 1024 / 1024)} MB
          </p>
          <p className="batch-drop-cols">
            12 columnas requeridas · acepta variantes (age, ap_hi, SystolicBP …) · BMI se calcula si falta.
          </p>
          <button type="button" className="btn btn-ghost" onClick={downloadTemplate}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M7 10l5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            Descargar plantilla
          </button>
        </div>
      )}

      {/* PARSED / preview --------------------------------------------------- */}
      {phase === 'parsed' && parsed && (
        <div className="batch-preview">
          <header className="batch-preview-head">
            <div>
              <div className="batch-preview-file">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                <span className="batch-preview-name">{filename}</span>
              </div>
              <div className="batch-preview-stats">
                <span className="stat-ok">{validCount.toLocaleString('es')} válidas</span>
                {invalidCount > 0 && <span className="stat-bad">{invalidCount.toLocaleString('es')} con errores</span>}
                <span className="stat-meta">{parsed.columnMap.size} columnas mapeadas</span>
              </div>
            </div>
            <button type="button" className="btn btn-ghost batch-reset" onClick={reset}>
              Cambiar archivo
            </button>
          </header>

          <div className="batch-preview-table">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>edad</th>
                  <th>sexo</th>
                  <th>presión</th>
                  <th>BMI</th>
                  <th>col.</th>
                  <th>gluc.</th>
                  <th>fuma</th>
                  <th>alc.</th>
                  <th>activ.</th>
                  <th className="th-status">estado</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 12).map((r) => (
                  <tr key={r.rowIndex} className={r.payload ? '' : 'row-bad'}>
                    <td className="cell-id">{r.id}</td>
                    {r.payload ? (
                      <>
                        <td>{r.payload.age_years}</td>
                        <td>{r.payload.gender === 1 ? 'F' : 'M'}</td>
                        <td>{r.payload.systolic_bp}/{r.payload.diastolic_bp}</td>
                        <td>{r.payload.bmi}</td>
                        <td>{r.payload.cholesterol}</td>
                        <td>{r.payload.gluc}</td>
                        <td>{r.payload.is_smoker ? '✓' : '·'}</td>
                        <td>{r.payload.drinks_alcohol ? '✓' : '·'}</td>
                        <td>{r.payload.is_physically_active ? '✓' : '·'}</td>
                        <td><span className="row-pill ok">válido</span></td>
                      </>
                    ) : (
                      <>
                        <td colSpan={9} className="row-errors">{r.errors.join(' · ')}</td>
                        <td><span className="row-pill bad">error</span></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.rows.length > 12 && (
              <p className="preview-more">… +{(parsed.rows.length - 12).toLocaleString('es')} filas más</p>
            )}
          </div>

          {error && <div className="batch-inline-error">{error}</div>}

          <div className="batch-actions">
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={validCount === 0}
              onClick={runBatch}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              Predecir {validCount.toLocaleString('es')} {validCount === 1 ? 'paciente' : 'pacientes'}
            </button>
          </div>
        </div>
      )}

      {/* LOADING ------------------------------------------------------------ */}
      {phase === 'loading' && (
        <div className="batch-loading">
          <div className="spinner" />
          <h3>Prediciendo {validRows.length.toLocaleString('es')} pacientes…</h3>
          <p>El endpoint de Databricks puede tardar hasta ~3 minutos si está frío.</p>
        </div>
      )}

      {/* ERROR -------------------------------------------------------------- */}
      {phase === 'error' && (
        <div className="batch-error">
          <div className="batch-error-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <h3>No se pudo procesar el archivo</h3>
          <p className="err-msg">{error}</p>
          <button type="button" className="btn btn-ghost" onClick={reset}>Volver a intentar</button>
        </div>
      )}
    </div>
  );
}
