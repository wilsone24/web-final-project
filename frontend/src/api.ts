import type { PredictionPayload, PredictionResult, DashboardResponse } from './types';

// Llama al proxy local (que reenvía a Databricks añadiendo el bearer token).
// En dev Vite hace proxy de /api → http://localhost:8000 (ver vite.config.ts).

export async function fetchDashboard(
  { refresh = false }: { refresh?: boolean } = {},
): Promise<DashboardResponse> {
  const url = refresh ? '/api/dashboard?refresh=1' : '/api/dashboard';
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} — ${text || res.statusText}`);
  }
  return (await res.json()) as DashboardResponse;
}

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

export async function fetchPrediction(record: PredictionPayload): Promise<PredictionResult> {
  const res = await fetch('/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataframe_records: [record] }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} — ${text || res.statusText}`);
  }

  const json = (await res.json()) as PredictApiResponse | PredictApiRow[];

  let row: PredictApiRow | undefined;
  if (Array.isArray((json as PredictApiResponse).predictions) && (json as PredictApiResponse).predictions!.length > 0) {
    row = (json as PredictApiResponse).predictions![0];
  } else if (Array.isArray(json) && json.length > 0) {
    row = json[0];
  } else {
    throw new Error('Respuesta inesperada del modelo: ' + JSON.stringify(json));
  }

  const probability = parseFloat(String(row.probability ?? row.prob ?? ''));
  const prediction  = parseInt(String(row.prediction ?? row.pred ?? ''), 10);

  if (!Number.isFinite(probability)) {
    throw new Error('No se recibió una probabilidad válida.');
  }

  return { probability, prediction };
}

export interface BatchResult {
  probability: number;
  prediction: number;
}

/** Send N patients in a single request. The Databricks endpoint already
 *  supports arrays under `dataframe_records`, and the proxy just forwards. */
export async function fetchPredictionBatch(records: PredictionPayload[]): Promise<BatchResult[]> {
  if (records.length === 0) return [];

  const res = await fetch('/api/predict', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ dataframe_records: records }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} — ${text || res.statusText}`);
  }

  const json = (await res.json()) as PredictApiResponse | PredictApiRow[];

  let rows: PredictApiRow[];
  if (Array.isArray((json as PredictApiResponse).predictions)) {
    rows = (json as PredictApiResponse).predictions!;
  } else if (Array.isArray(json)) {
    rows = json;
  } else {
    throw new Error('Respuesta inesperada del modelo: ' + JSON.stringify(json));
  }

  if (rows.length !== records.length) {
    throw new Error(`El modelo devolvió ${rows.length} filas pero se enviaron ${records.length}.`);
  }

  return rows.map((r) => ({
    probability: parseFloat(String(r.probability ?? r.prob  ?? '')),
    prediction:  parseInt(String(r.prediction  ?? r.pred ?? ''), 10),
  }));
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
  try {
    const res = await fetch('/api/analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(args),
    });

    if (res.status === 503) return ANALYSIS_DISABLED;     // feature off on backend
    if (!res.ok)            return ANALYSIS_DISABLED;     // any other failure → hide

    const json = await res.json() as Partial<AnalysisResponse>;
    if (!json.analysis) return ANALYSIS_DISABLED;
    return { analysis: json.analysis, model: json.model };
  } catch {
    return ANALYSIS_DISABLED;
  }
}
