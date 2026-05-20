import express, { type Request, type Response } from 'express';
import cors from 'cors';
import 'dotenv/config';
import { getDashboardData, clearDashboardCache } from './databricks.js';

const app  = express();
const PORT = Number(process.env.PORT) || 8000;

const ENDPOINT_URL = 'https://eastus-c3.azuredatabricks.net/serving-endpoints/cardio-classifier-endpoint/invocations';
const TOKEN        = process.env.DATABRICKS_TOKEN;

if (!TOKEN) {
  console.error('\n[CardioProxy] Falta DATABRICKS_TOKEN.');
  console.error('              Copia backend/.env.example a backend/.env y pega tu token.\n');
  process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, target: ENDPOINT_URL });
});

app.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const force = req.query.refresh === '1' || req.query.refresh === 'true';
    if (force) clearDashboardCache();

    const { data, cached, age } = await getDashboardData({ force });

    res.set('Cache-Control', 'no-store');
    res.json({
      cached,
      cacheAgeMs: age,
      generatedAt: new Date().toISOString(),
      ...data,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[CardioProxy] Dashboard query failed:', err);
    res.status(502).json({
      error: 'dashboard_query_failed',
      detail,
    });
  }
});

interface PredictBody {
  dataframe_records?: unknown[];
}

app.post('/predict', async (req: Request<unknown, unknown, PredictBody>, res: Response) => {
  const body = req.body;

  if (!body || !Array.isArray(body.dataframe_records) || body.dataframe_records.length === 0) {
    return res.status(400).json({
      error:  'bad_request',
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
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[CardioProxy] Error al contactar Databricks:', err);
    res.status(502).json({
      error:  'upstream_unreachable',
      detail,
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n[CardioProxy] escuchando en http://localhost:${PORT}`);
  console.log(`              POST /predict    → ${ENDPOINT_URL}`);
  console.log(`              GET  /dashboard  → ${process.env.DATABRICKS_SQL_HOST || '(SQL warehouse no configurado)'}`);
  console.log(`              GET  /health\n`);
});
