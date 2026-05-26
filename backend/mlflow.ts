// MLflow REST client for the cardio model registry.
//
// Fetches @champion version metadata, the training run's test metrics, and the
// `tables/feature_importance.csv` artifact produced by ml_train_cardio_classifier.py.
// Mirrors the in-memory cache pattern of databricks.ts so cold starts on the
// workspace API don't bite users every page load.

const MODEL_NAME = process.env.DATABRICKS_MODEL_NAME
  || 'databricks_service_pf.gold.cardio_classifier';
const CHAMPION_ALIAS = 'champion';

// Token + workspace host can come from explicit env vars, or be derived from
// the model-serving URL we already require (DATABRICKS_ENDPOINT_URL).
const TOKEN = process.env.DATABRICKS_TOKEN;

function resolveWorkspaceHost(): string | null {
  if (process.env.DATABRICKS_WORKSPACE_HOST) {
    const raw = process.env.DATABRICKS_WORKSPACE_HOST.trim();
    return raw.startsWith('http') ? raw : `https://${raw}`;
  }
  const serving = process.env.DATABRICKS_ENDPOINT_URL;
  if (serving) {
    try {
      return new URL(serving).origin;
    } catch {
      return null;
    }
  }
  const sqlHost = process.env.DATABRICKS_SQL_HOST;
  if (sqlHost) {
    return sqlHost.startsWith('http') ? sqlHost : `https://${sqlHost}`;
  }
  return null;
}

const WORKSPACE_HOST = resolveWorkspaceHost();

// -- Shapes returned to the frontend ----------------------------------------

export interface ModelMetrics {
  accuracy:  number | null;
  precision: number | null;
  recall:    number | null;
  f1:        number | null;
  roc_auc:   number | null;
  pr_auc:    number | null;
}

export interface FeatureImportanceRow {
  feature: string;
  importance: number;
}

export interface ThresholdSweepRow {
  threshold: number;
  f1:        number;
  precision: number;
  recall:    number;
}

export interface ModelInfo {
  model_name:        string;
  version:           string;
  algorithm:         string;
  optimal_threshold: number | null;
  pipeline_version:  string | null;
  champion_since:    string | null;
  training_run_id:   string | null;
  description:       string | null;
  metrics:           ModelMetrics;
  feature_count:     number | null;
  train_rows:        number | null;
  test_rows:         number | null;
  feature_importance: FeatureImportanceRow[];
  threshold_sweep:    ThresholdSweepRow[];
}

// -- MLflow REST API shapes (subset of what we read) ------------------------

interface MlflowTag { key: string; value: string; }

// Unity Catalog REST API shapes -------------------------------------------
//
// UC returns objects directly (not wrapped in a `model_version` field like
// the open-source MLflow API). It also doesn't expose version-level tags
// in the version GET — those have to come from the run instead.

// UC returns the alias info under various shapes depending on the workspace
// version — sometimes as the raw object, sometimes wrapped. We accept any
// of the common keys and extract the version number defensively.
interface UcAliasResponse {
  alias_name?:        string;
  model_version_num?: number | string;
  version_num?:       number | string;
  version?:           number | string;
  // Possible wrappers:
  registered_model_alias?: {
    alias_name?:        string;
    model_version_num?: number | string;
    version_num?:       number | string;
  };
  alias?: {
    model_version_num?: number | string;
    version_num?:       number | string;
  };
}

function extractAliasVersionNum(resp: UcAliasResponse): string | null {
  const candidates: Array<number | string | undefined> = [
    resp.model_version_num,
    resp.version_num,
    resp.version,
    resp.registered_model_alias?.model_version_num,
    resp.registered_model_alias?.version_num,
    resp.alias?.model_version_num,
    resp.alias?.version_num,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim() !== '') return String(c);
  }
  return null;
}

interface UcModelVersion {
  model_name?:   string;
  catalog_name?: string;
  schema_name?:  string;
  version?:      number | string;
  run_id?:       string;
  status?:       string;
  comment?:      string;
  source?:       string;
  created_at?:   number;
  updated_at?:   number;
}

interface MlflowRunResponse {
  run: {
    info: { run_id: string; experiment_id: string; status: string };
    data: {
      metrics?: Array<{ key: string; value: number; timestamp?: number; step?: number }>;
      params?:  Array<{ key: string; value: string }>;
      tags?:    MlflowTag[];
    };
  };
}

// -- Low-level fetch helpers -------------------------------------------------

function assertConfigured(): void {
  if (!TOKEN) {
    throw new Error('DATABRICKS_TOKEN is not configured.');
  }
  if (!WORKSPACE_HOST) {
    throw new Error(
      'No workspace host configured. Set DATABRICKS_WORKSPACE_HOST or DATABRICKS_ENDPOINT_URL.',
    );
  }
}

function buildUrl(endpoint: string, query: Record<string, string>): string {
  const qs = new URLSearchParams(query).toString();
  return qs.length > 0
    ? `${WORKSPACE_HOST}${endpoint}?${qs}`
    : `${WORKSPACE_HOST}${endpoint}`;
}

async function dbxGet<T>(endpoint: string, query: Record<string, string> = {}): Promise<T> {
  assertConfigured();
  const url = buildUrl(endpoint, query);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Databricks ${endpoint} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

async function dbxGetText(endpoint: string, query: Record<string, string> = {}): Promise<string> {
  assertConfigured();
  const url = buildUrl(endpoint, query);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Databricks ${endpoint} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return await res.text();
}

// -- Helpers -----------------------------------------------------------------

function tagsToMap(tags?: MlflowTag[]): Record<string, string> {
  if (!tags) return {};
  const out: Record<string, string> = {};
  for (const t of tags) out[t.key] = t.value;
  return out;
}

function metricsFromRun(run: MlflowRunResponse['run']): ModelMetrics {
  const map: Record<string, number> = {};
  for (const m of run.data.metrics ?? []) map[m.key] = m.value;
  const pick = (k: string): number | null => (k in map && Number.isFinite(map[k]) ? map[k] : null);
  return {
    accuracy:  pick('test_accuracy'),
    precision: pick('test_precision'),
    recall:    pick('test_recall'),
    f1:        pick('test_f1'),
    roc_auc:   pick('test_roc_auc'),
    pr_auc:    pick('test_pr_auc'),
  };
}

function paramValue(run: MlflowRunResponse['run'], key: string): string | null {
  const param = (run.data.params ?? []).find((p) => p.key === key);
  return param ? param.value : null;
}

function paramsToInt(run: MlflowRunResponse['run'], key: string): number | null {
  const raw = paramValue(run, key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function paramsToFloat(run: MlflowRunResponse['run'], key: string): number | null {
  const raw = paramValue(run, key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseFeatureImportanceCsv(csv: string, limit: number = 12): FeatureImportanceRow[] {
  // Two-column CSV produced by training: "feature,importance" with a header row.
  // Already sorted descending by importance — we just trim to top-N for the UI.
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) return [];

  const header = lines[0].toLowerCase().split(',');
  const featureIdx    = header.indexOf('feature');
  const importanceIdx = header.indexOf('importance');
  if (featureIdx === -1 || importanceIdx === -1) {
    throw new Error(`feature_importance.csv has unexpected header: ${lines[0]}`);
  }

  const rows: FeatureImportanceRow[] = [];
  for (let i = 1; i < lines.length && rows.length < limit; i++) {
    const cols = lines[i].split(',');
    const feature    = cols[featureIdx];
    const importance = Number(cols[importanceIdx]);
    if (feature && Number.isFinite(importance)) {
      rows.push({ feature, importance });
    }
  }
  return rows;
}

function parseThresholdSweepCsv(csv: string): ThresholdSweepRow[] {
  // Columns produced by find_optimal_threshold(): threshold,score,precision,recall
  // where `score` is the F1 (metric_fn=f1_score). ~80 rows (0.10→0.90 step 0.01).
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) return [];

  const header = lines[0].toLowerCase().split(',');
  const tIdx = header.indexOf('threshold');
  const sIdx = header.indexOf('score');
  const pIdx = header.indexOf('precision');
  const rIdx = header.indexOf('recall');
  if (tIdx === -1 || sIdx === -1 || pIdx === -1 || rIdx === -1) {
    throw new Error(`threshold_sweep.csv has unexpected header: ${lines[0]}`);
  }

  const rows: ThresholdSweepRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols      = lines[i].split(',');
    const threshold = Number(cols[tIdx]);
    const f1        = Number(cols[sIdx]);
    const precision = Number(cols[pIdx]);
    const recall    = Number(cols[rIdx]);
    if ([threshold, f1, precision, recall].every(Number.isFinite)) {
      rows.push({ threshold, f1, precision, recall });
    }
  }
  return rows;
}

// -- Main fetcher ------------------------------------------------------------

async function fetchModelInfoUncached(): Promise<ModelInfo> {
  console.log(`[ModelInfo] Resolving @${CHAMPION_ALIAS} of ${MODEL_NAME}`);

  // 1. Resolve alias → version number via the Unity Catalog REST API.
  //    This is the official UC endpoint; the MLflow REST forms
  //    (`/api/2.0/mlflow/registered-models/alias` and
  //     `/api/2.0/mlflow/unity-catalog/model-versions/get-by-alias`)
  //    both 404 against UC-backed model registries on Databricks.
  const modelPath = encodeURIComponent(MODEL_NAME);
  const aliasResp = await dbxGet<UcAliasResponse>(
    `/api/2.1/unity-catalog/models/${modelPath}/aliases/${encodeURIComponent(CHAMPION_ALIAS)}`,
  );

  const versionNum = extractAliasVersionNum(aliasResp);
  if (!versionNum) {
    throw new Error(
      `@${CHAMPION_ALIAS} alias response had no recognizable version field. ` +
      `Raw: ${JSON.stringify(aliasResp).slice(0, 200)}`,
    );
  }

  // 2. Get the full UC model version (we need the run_id and updated_at).
  const mv = await dbxGet<UcModelVersion>(
    `/api/2.1/unity-catalog/models/${modelPath}/versions/${encodeURIComponent(versionNum)}`,
  );

  const trainingRunId = mv.run_id ?? null;
  console.log(`[ModelInfo] champion v${versionNum} (run_id=${trainingRunId})`);

  // 3. Pull the training run for metrics + params + tags.
  //    Algorithm, threshold, feature_count, train/test row counts and
  //    pipeline_version are all logged at run-time, so we don't depend on
  //    version-level tags (which UC doesn't expose through these endpoints).
  let metrics: ModelMetrics = {
    accuracy: null, precision: null, recall: null, f1: null, roc_auc: null, pr_auc: null,
  };
  let algorithm:       string = 'unknown';
  let optimalThreshold: number | null = null;
  let pipelineVersion:  string | null = null;
  let featureCount:     number | null = null;
  let trainRows:        number | null = null;
  let testRows:         number | null = null;

  if (trainingRunId) {
    try {
      const runResp = await dbxGet<MlflowRunResponse>(
        '/api/2.0/mlflow/runs/get',
        { run_id: trainingRunId },
      );
      metrics = metricsFromRun(runResp.run);
      const runTags = tagsToMap(runResp.run.data.tags);

      algorithm        = paramValue(runResp.run, 'winner_algorithm')
                      ?? runTags['winner.algorithm']
                      ?? 'unknown';
      optimalThreshold = paramsToFloat(runResp.run, 'optimal_threshold');
      pipelineVersion  = paramValue(runResp.run, 'pipeline_version')
                      ?? runTags['pipeline.version']
                      ?? null;
      featureCount     = paramsToInt(runResp.run, 'feature_count');
      trainRows        = paramsToInt(runResp.run, 'train_rows');
      testRows         = paramsToInt(runResp.run, 'test_rows');
    } catch (err) {
      console.warn(`[ModelInfo] Could not read training run: ${err}`);
    }
  }

  // 4. Pull CSV artifacts (best-effort, in parallel).
  //    `/api/2.0/mlflow/get-artifact` uses the legacy `run_uuid` query param,
  //    not `run_id` like the other MLflow endpoints. Passing `run_id` triggers
  //    a 400 "Request must include path and run_uuid" from Databricks.
  let featureImportance: FeatureImportanceRow[] = [];
  let thresholdSweep:    ThresholdSweepRow[]    = [];
  if (trainingRunId) {
    const [fiResult, tsResult] = await Promise.allSettled([
      dbxGetText('/api/2.0/mlflow/get-artifact',
        { run_uuid: trainingRunId, path: 'tables/feature_importance.csv' }),
      dbxGetText('/api/2.0/mlflow/get-artifact',
        { run_uuid: trainingRunId, path: 'tables/threshold_sweep.csv' }),
    ]);

    if (fiResult.status === 'fulfilled') {
      try {
        featureImportance = parseFeatureImportanceCsv(fiResult.value);
        console.log(`[ModelInfo] loaded ${featureImportance.length} feature importance rows`);
      } catch (err) {
        console.warn(`[ModelInfo] Could not parse feature_importance.csv: ${err}`);
      }
    } else {
      console.warn(`[ModelInfo] Could not load feature_importance.csv: ${fiResult.reason}`);
    }

    if (tsResult.status === 'fulfilled') {
      try {
        thresholdSweep = parseThresholdSweepCsv(tsResult.value);
        console.log(`[ModelInfo] loaded ${thresholdSweep.length} threshold sweep rows`);
      } catch (err) {
        console.warn(`[ModelInfo] Could not parse threshold_sweep.csv: ${err}`);
      }
    } else {
      console.warn(`[ModelInfo] Could not load threshold_sweep.csv: ${tsResult.reason}`);
    }
  }

  // UC version's updated_at is a millisecond epoch — use it as a proxy for
  // "champion since" since version-level tags aren't exposed by these endpoints.
  const championSince = mv.updated_at
    ? new Date(mv.updated_at).toISOString()
    : null;

  return {
    model_name:        MODEL_NAME,
    version:           versionNum,
    algorithm,
    optimal_threshold: optimalThreshold,
    pipeline_version:  pipelineVersion,
    champion_since:    championSince,
    training_run_id:   trainingRunId,
    description:       mv.comment ?? null,
    metrics,
    feature_count:     featureCount,
    train_rows:        trainRows,
    test_rows:         testRows,
    feature_importance: featureImportance,
    threshold_sweep:    thresholdSweep,
  };
}

// -- In-memory cache (forever, like dashboard) ------------------------------

interface CacheEntry {
  data: ModelInfo | null;
  ts: number;
  inflight: Promise<ModelInfo> | null;
}

let cache: CacheEntry = { data: null, ts: 0, inflight: null };

export interface ModelInfoResult {
  data: ModelInfo;
  cached: boolean;
  age: number;
}

export async function getModelInfo(
  { force = false }: { force?: boolean } = {},
): Promise<ModelInfoResult> {
  const now = Date.now();

  if (!force && cache.data) {
    return { data: cache.data, cached: true, age: now - cache.ts };
  }
  if (cache.inflight) {
    const data = await cache.inflight;
    return { data, cached: false, age: 0 };
  }

  cache.inflight = fetchModelInfoUncached();
  try {
    const data = await cache.inflight;
    cache.data = data;
    cache.ts   = Date.now();
    return { data, cached: false, age: 0 };
  } finally {
    cache.inflight = null;
  }
}

export function clearModelInfoCache(): void {
  cache = { data: null, ts: 0, inflight: null };
}
