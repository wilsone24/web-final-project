import express, { type Request, type Response } from 'express';
import cors from 'cors';
import 'dotenv/config';
import { getDashboardData, clearDashboardCache } from './databricks.js';

const app  = express();
const PORT = Number(process.env.PORT) || 8000;

const ENDPOINT_URL   = process.env.DATABRICKS_ENDPOINT_URL;
const TOKEN          = process.env.DATABRICKS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL   = process.env.OPENAI_MODEL || 'gpt-4o';
const OPENAI_URL     = 'https://api.openai.com/v1/chat/completions';

if (!TOKEN) {
  console.error('\n[CardioProxy] Falta DATABRICKS_TOKEN.');
  console.error('              Copia backend/.env.example a backend/.env y pega tu token.\n');
  process.exit(1);
}

if (!ENDPOINT_URL) {
  console.error('\n[CardioProxy] Falta DATABRICKS_ENDPOINT_URL.');
  console.error('              Pégalo en backend/.env. Ejemplo:');
  console.error('              DATABRICKS_ENDPOINT_URL=https://adb-XXXXXXXXXXXXXXX.X.azuredatabricks.net/serving-endpoints/cardio-classifier-endpoint/invocations\n');
  process.exit(1);
}

app.use(cors());
// 10mb supports batch CSV uploads of ~5000 patients per request.
app.use(express.json({ limit: '10mb' }));

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

// Retry transient connection errors (cold starts, brief network blips) with
// exponential backoff. Node's default fetch connect-timeout is 10s, which is
// too short for Databricks Model Serving cold starts (30-60s) — so on a
// connect timeout we wait and retry up to a few times. The total worst-case
// wait is ~55s which still feels acceptable while the frontend shows its
// loading spinner.

const TRANSIENT_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
]);

function isTransientError(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string } })?.cause;
  return !!cause?.code && TRANSIENT_CODES.has(cause.code);
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  { tag, delays = [0, 10_000, 20_000] }: { tag: string; delays?: number[] },
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) {
      console.log(`[CardioProxy] ${tag}: reintentando en ${delays[i] / 1000}s (probable cold start)…`);
      await new Promise((r) => setTimeout(r, delays[i]));
    }
    try {
      const res = await fetch(url, init);
      if (i > 0) console.log(`[CardioProxy] ${tag}: éxito en intento ${i + 1}`);
      return res;
    } catch (err) {
      lastErr = err;
      const cause = (err as { cause?: { code?: string } })?.cause;
      if (!isTransientError(err)) throw err;
      console.warn(`[CardioProxy] ${tag} intento ${i + 1}/${delays.length} falló (${cause?.code})`);
    }
  }
  throw lastErr;
}

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
    const upstream = await fetchWithRetry(
      ENDPOINT_URL!,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(body),
      },
      { tag: 'databricks /predict', delays: [0, 10_000, 20_000] },
    );

    const text        = await upstream.text();
    const contentType = upstream.headers.get('content-type') || 'application/json';

    if (!upstream.ok) {
      console.error(`[CardioProxy] Databricks ${upstream.status}:`, text.slice(0, 400));
    }

    res.status(upstream.status).type(contentType).send(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[CardioProxy] Error al contactar Databricks:', err);
    const wasTransient = isTransientError(err);
    res.status(502).json({
      error:  'upstream_unreachable',
      detail,
      hint:   wasTransient
        ? 'El endpoint de Databricks probablemente está en cold start. Espera 30s y vuelve a intentar.'
        : undefined,
    });
  }
});

// -- /analyze ----------------------------------------------------------------
// Calls OpenAI Chat Completions to generate a short narrative analysis of a
// patient + the model's classification. Optional feature: if OPENAI_API_KEY
// is not configured, returns 503 with { disabled: true } so the frontend can
// silently hide the section.

interface AnalyzeBody {
  patient?:     Record<string, number>;
  prediction?:  number;
  probability?: number;
  factors?:     string[];
}

const SYSTEM_PROMPT =
  'Eres un asistente educativo de salud cardiovascular. Recibes los datos clínicos ' +
  'de un paciente y el resultado de un modelo XGBoost de screening cardiovascular. ' +
  'Da un análisis de 3 a 4 oraciones en español neutro, sin jerga médica, sin viñetas — ' +
  'prosa breve. Identifica los 2 o 3 factores que más pesan según los datos del paciente. ' +
  'Si la predicción es 1 ("Indicios"), sugiere consultar con un profesional de la salud. ' +
  'Si es 0 ("Sin indicios"), refuerza los hábitos saludables visibles. ' +
  'Termina dejando claro que el modelo es informativo y no sustituye un diagnóstico médico. ' +
  'Nunca uses la palabra "alto riesgo" o "bajo riesgo" — usa "indicios" o "sin indicios" según corresponda.';

app.post('/analyze', async (req: Request<unknown, unknown, AnalyzeBody>, res: Response) => {
  if (!OPENAI_API_KEY) {
    return res.status(503).json({ disabled: true, reason: 'OPENAI_API_KEY no configurada' });
  }

  const { patient, prediction, probability, factors } = req.body || {};
  if (!patient || typeof prediction !== 'number' || typeof probability !== 'number') {
    return res.status(400).json({
      error:  'bad_request',
      detail: 'Body debe incluir { patient, prediction, probability, factors? }',
    });
  }

  const userMessage =
    `Datos del paciente:\n${JSON.stringify(patient, null, 2)}\n\n` +
    `Resultado del modelo:\n- probabilidad = ${probability.toFixed(3)}\n` +
    `- prediction = ${prediction} (${prediction === 1 ? 'Indicios' : 'Sin indicios'})\n\n` +
    (factors && factors.length > 0
      ? `Factores ya identificados a partir de los datos:\n- ${factors.join('\n- ')}\n\n`
      : '') +
    'Redacta el análisis breve (3-4 oraciones, prosa).';

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 15_000);

  try {
    const upstream = await fetch(OPENAI_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model:       OPENAI_MODEL,
        max_tokens:  220,
        temperature: 0.5,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMessage },
        ],
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      console.error(`[CardioProxy] OpenAI ${upstream.status}:`, text.slice(0, 400));
      return res.status(502).json({
        error:  'openai_failed',
        detail: `OpenAI respondió ${upstream.status}: ${text.slice(0, 200)}`,
      });
    }

    const json = await upstream.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const analysis = json.choices?.[0]?.message?.content?.trim();
    if (!analysis) {
      return res.status(502).json({ error: 'openai_empty', detail: 'Respuesta vacía de OpenAI.' });
    }
    res.json({ analysis, model: OPENAI_MODEL });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[CardioProxy] Error en /analyze:', err);
    res.status(502).json({ error: 'openai_unreachable', detail });
  } finally {
    clearTimeout(timeoutId);
  }
});

app.listen(PORT, () => {
  console.log(`\n[CardioProxy] escuchando en http://localhost:${PORT}`);
  console.log(`              POST /predict    → ${ENDPOINT_URL}`);
  console.log(`              GET  /dashboard  → ${process.env.DATABRICKS_SQL_HOST || '(SQL warehouse no configurado)'}`);
  console.log(`              POST /analyze    → ${OPENAI_API_KEY ? `OpenAI (${OPENAI_MODEL})` : '(deshabilitado · falta OPENAI_API_KEY)'}`);
  console.log(`              GET  /health\n`);
});
