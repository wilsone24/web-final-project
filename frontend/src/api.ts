import type { PredictionPayload, PredictionResult, DashboardResponse, ModelInfoResponse } from './types';

// Calls the local proxy (which forwards to Databricks adding the bearer token).
// In dev, Vite proxies /api → http://localhost:8000 (see vite.config.ts).

// -- Low-level fetch ---------------------------------------------------------

/** GET/POST JSON with a uniform error shape. Throws on non-2xx. */
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} — ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

/**
 * Builds a cached GET fetcher for an endpoint. The payload is held in module
 * memory so navigating between pages hits memory, not the backend. Concurrent
 * callers share one in-flight promise. `{ refresh: true }` wipes the local
 * cache and forwards `?refresh=1` so the backend invalidates its cache too.
 */
function createCachedFetcher<T>(path: string) {
  let cache: T | null = null;
  let inflight: Promise<T> | null = null;

  return async ({ refresh = false }: { refresh?: boolean } = {}): Promise<T> => {
    if (refresh) { cache = null; inflight = null; }
    if (cache)    return cache;
    if (inflight) return inflight;

    const url = refresh ? `${path}?refresh=1` : path;
    inflight = (async () => {
      try {
        cache = await fetchJson<T>(url);
        return cache;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  };
}

export const fetchDashboard = createCachedFetcher<DashboardResponse>('/api/dashboard');
export const fetchModelInfo = createCachedFetcher<ModelInfoResponse>('/api/model-info');

// -- /predict ----------------------------------------------------------------

interface PredictApiRow {
  probability?: number | string;
  prob?: number | string;
  prediction?: number | string;
  pred?: number | string;
  [k: string]: unknown;
}

interface PredictApiResponse {
  predictions?: PredictApiRow[];
  [k: string]: unknown;
}

export interface BatchResult {
  probability: number;
  prediction: number;
}

/** Databricks may return rows under `predictions` or as a bare array. */
function extractRows(json: PredictApiResponse | PredictApiRow[]): PredictApiRow[] {
  if (Array.isArray((json as PredictApiResponse).predictions)) {
    return (json as PredictApiResponse).predictions!;
  }
  if (Array.isArray(json)) return json;
  throw new Error('Respuesta inesperada del modelo: ' + JSON.stringify(json));
}

/** Normalize a single prediction row (handles prob/prediction key variants). */
function parseRow(r: PredictApiRow): BatchResult {
  return {
    probability: parseFloat(String(r.probability ?? r.prob ?? '')),
    prediction:  parseInt(String(r.prediction ?? r.pred ?? ''), 10),
  };
}

const predictInit = (records: PredictionPayload[]): RequestInit => ({
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({ dataframe_records: records }),
});

export async function fetchPrediction(record: PredictionPayload): Promise<PredictionResult> {
  const json = await fetchJson<PredictApiResponse | PredictApiRow[]>('/api/predict', predictInit([record]));
  const rows = extractRows(json);
  if (rows.length === 0) {
    throw new Error('Respuesta inesperada del modelo: ' + JSON.stringify(json));
  }
  const { probability, prediction } = parseRow(rows[0]);
  if (!Number.isFinite(probability)) {
    throw new Error('No se recibió una probabilidad válida.');
  }
  return { probability, prediction };
}

/** Send N patients in a single request. The Databricks endpoint already
 *  supports arrays under `dataframe_records`, and the proxy just forwards. */
export async function fetchPredictionBatch(records: PredictionPayload[]): Promise<BatchResult[]> {
  if (records.length === 0) return [];

  const json = await fetchJson<PredictApiResponse | PredictApiRow[]>('/api/predict', predictInit(records));
  const rows = extractRows(json);
  if (rows.length !== records.length) {
    throw new Error(`El modelo devolvió ${rows.length} filas pero se enviaron ${records.length}.`);
  }
  return rows.map(parseRow);
}

// -- /analyze ----------------------------------------------------------------

export interface AnalysisResponse {
  analysis: string;
  model?:   string;
}

/** Returned by fetchAnalysis when the backend reports the feature is disabled
 *  (no OPENAI_API_KEY) or any other failure — caller uses this to silently hide
 *  the analysis section instead of bubbling up an error. */
export const ANALYSIS_DISABLED = Symbol('analysis-disabled');
export type AnalysisOutcome = AnalysisResponse | typeof ANALYSIS_DISABLED;

export async function fetchAnalysis(args: {
  patient:     PredictionPayload;
  prediction:  number;
  probability: number;
  factors?:    string[];
}): Promise<AnalysisOutcome> {
  // Distinct from fetchJson: any failure degrades to ANALYSIS_DISABLED (the
  // section is optional) rather than throwing.
  try {
    const res = await fetch('/api/analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(args),
    });

    if (!res.ok) return ANALYSIS_DISABLED;   // 503 (disabled) or any other failure → hide

    const json = await res.json() as Partial<AnalysisResponse>;
    if (!json.analysis) return ANALYSIS_DISABLED;
    return { analysis: json.analysis, model: json.model };
  } catch {
    return ANALYSIS_DISABLED;
  }
}
