// Llama al proxy local (que reenvía a Databricks añadiendo el bearer token).
// En dev Vite hace proxy de /api → http://localhost:8000 (ver vite.config.js).
export async function fetchPrediction(record) {
  const res = await fetch('/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataframe_records: [record] }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} — ${text || res.statusText}`);
  }

  const json = await res.json();

  let row;
  if (Array.isArray(json.predictions) && json.predictions.length > 0) {
    row = json.predictions[0];
  } else if (Array.isArray(json) && json.length > 0) {
    row = json[0];
  } else {
    throw new Error('Respuesta inesperada del modelo: ' + JSON.stringify(json));
  }

  const probability = parseFloat(row.probability ?? row.prob ?? row[0]);
  const prediction  = parseInt(row.prediction  ?? row.pred ?? row[1], 10);

  if (!Number.isFinite(probability)) {
    throw new Error('No se recibió una probabilidad válida.');
  }

  return { probability, prediction };
}
