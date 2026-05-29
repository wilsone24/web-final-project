import express, { type Request, type Response } from 'express';
import cors from 'cors';
import 'dotenv/config';
import { getDashboardData, clearDashboardCache } from './databricks.js';
import { getModelInfo, clearModelInfoCache } from './mlflow.js';

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

app.get('/model-info', async (req: Request, res: Response) => {
  try {
    const force = req.query.refresh === '1' || req.query.refresh === 'true';
    if (force) clearModelInfoCache();

    const { data, cached, age } = await getModelInfo({ force });

    res.set('Cache-Control', 'no-store');
    res.json({
      cached,
      cacheAgeMs: age,
      generatedAt: new Date().toISOString(),
      ...data,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[CardioProxy] Model info query failed:', err);
    res.status(502).json({
      error: 'model_info_failed',
      detail,
    });
  }
});

// Retry transient connection errors (cold starts, brief network blips) with
// exponential backoff. Node's default fetch connect-timeout is 10s, which is
// too short for Databricks Model Serving cold starts (30-60s) — so on a
// connect timeout we wait and retry up to a few times. With the current
// schedule the total worst-case wait is ~210s (3.5 min): the inter-attempt
// pauses sum to 150s and each of the 6 attempts can burn ~10s on its connect
// timeout. The frontend shows a loading spinner the whole time.

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
  { tag, delays = [0, 15_000, 30_000, 30_000, 30_000, 45_000] }: { tag: string; delays?: number[] },
): Promise<globalThis.Response> {
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
      { tag: 'databricks /predict', delays: [0, 15_000, 30_000, 30_000, 30_000, 45_000] },
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
        ? 'El endpoint de Databricks probablemente está en cold start. Espera ~3 minutos y vuelve a intentar.'
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

const SYSTEM_PROMPT = [
  'Eres un asistente educativo de salud cardiovascular. Recibes los datos clínicos',
  'de una persona y el resultado de un modelo XGBoost de screening cardiovascular.',
  '',
  'Habla SIEMPRE en SEGUNDA PERSONA — directamente a la persona ("tu presión",',
  '"tus hábitos"), nunca en tercera persona ("el paciente").',
  'Tu tono es cálido, respetuoso y constructivo: ni clínico frío, ni alarmista.',
  '',
  'Responde con EXACTAMENTE 3 oraciones, en prosa fluida sin viñetas:',
  '',
  '1. Ancla el resultado del modelo usando "indicios" o "sin indicios" según el',
  '   valor de prediction, y menciona brevemente el factor o factores que más pesan.',
  '',
  '2. Combina en UNA sola oración un aspecto POSITIVO visible en sus datos',
  '   (un valor saludable o hábito favorable — SIEMPRE encuentra algo a favor,',
  '   incluso si la predicción es positiva) y un aspecto a MEJORAR, sin alarmismo.',
  '',
  '3. Cierra con UNA sugerencia accionable concreta anclada en sus datos.',
  '   NO uses el genérico "consulta a tu médico" — algo específico como:',
  '   "considera reducir sal en tu dieta para ayudar a bajar tu presión",',
  '   "mantener tu actividad física actual es clave",',
  '   "una evaluación médica anual sería un buen hábito".',
  '',
  'NO incluyas disclaimer ni aclaración legal — eso ya lo agrega la interfaz.',
  '',
  'Reglas estrictas:',
  '- EXACTAMENTE 3 oraciones, ni una más.',
  '- NUNCA uses "alto riesgo", "riesgo bajo" o "riesgo moderado". Usa "indicios"',
  '  o "sin indicios" según corresponda.',
  '- NUNCA jerga médica compleja. Español natural.',
  '- NUNCA bullets, listas, saltos de línea ni viñetas. Es prosa continua.',
  '- NO repitas literalmente los factores que te paso — úsalos como insumo',
  '  pero redacta en tus propias palabras.',
].join('\n');

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
        max_tokens:  240,
        temperature: 0.55,
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
  console.log(`              GET  /model-info → MLflow Registry (@champion)`);
  console.log(`              POST /analyze    → ${OPENAI_API_KEY ? `OpenAI (${OPENAI_MODEL})` : '(deshabilitado · falta OPENAI_API_KEY)'}`);
  console.log(`              GET  /health\n`);
});
