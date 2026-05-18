import express from 'express';
import cors from 'cors';
import 'dotenv/config';

const app  = express();
const PORT = process.env.PORT || 8000;

const ENDPOINT_URL = 'https://eastus-c3.azuredatabricks.net/serving-endpoints/cardio-classifier-endpoint/invocations';
const TOKEN        = process.env.DATABRICKS_TOKEN;

if (!TOKEN) {
  console.error('\n[CardioProxy] Falta DATABRICKS_TOKEN.');
  console.error('              Copia backend/.env.example a backend/.env y pega tu token.\n');
  process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, target: ENDPOINT_URL });
});

app.post('/predict', async (req, res) => {
  const body = req.body;

  if (!body || !Array.isArray(body.dataframe_records) || body.dataframe_records.length === 0) {
    return res.status(400).json({
      error: 'bad_request',
      detail: 'El body debe incluir "dataframe_records" como arreglo no vacío.',
    });
  }

  try {
    const upstream = await fetch(ENDPOINT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    });

    const text        = await upstream.text();
    const contentType = upstream.headers.get('content-type') || 'application/json';

    if (!upstream.ok) {
      console.error(`[CardioProxy] Databricks ${upstream.status}:`, text.slice(0, 400));
    }

    res.status(upstream.status).type(contentType).send(text);

  } catch (err) {
    console.error('[CardioProxy] Error al contactar Databricks:', err);
    res.status(502).json({
      error:  'upstream_unreachable',
      detail: String(err?.message || err),
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n[CardioProxy] escuchando en http://localhost:${PORT}`);
  console.log(`              POST /predict   → ${ENDPOINT_URL}`);
  console.log(`              GET  /health\n`);
});
