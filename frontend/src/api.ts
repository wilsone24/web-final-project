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
