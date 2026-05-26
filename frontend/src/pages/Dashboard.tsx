import { useEffect, useState, useCallback } from 'react';
import { fetchDashboard, fetchModelInfo } from '../api';
import useReveal from '../hooks/useReveal';
import { palette } from '../theme';
import KpiCard from '../components/dashboard/KpiCard';
import ChartCard from '../components/dashboard/ChartCard';
import ModelCardBanner from '../components/dashboard/ModelCardBanner';
import FeatureImportanceChart from '../components/dashboard/FeatureImportanceChart';
import ThresholdSweepChart from '../components/dashboard/ThresholdSweepChart';
import {
  CvdByCategoryChart,
  RateBarChart,
  DonutChart,
  LifestyleChart,
} from '../components/dashboard/charts';
import type {
  DashboardResponse,
  DashboardCategoryRow,
  DashboardLifestyleRow,
  DashboardKpi,
  DashboardState,
  ModelInfoResponse,
} from '../types';

type ModelInfoState = 'loading' | 'ready' | 'error';

const N = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// The Databricks SQL driver may return numerics as JS numbers, BigInt or strings.
// Normalize each row so the charts can consume them.
function normalizeCategoryRows(rows?: DashboardCategoryRow[]): DashboardCategoryRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    id:        Number(r.id),
    label:     String(r.label),
    patients:  Number(N(r.patients) ?? 0),
    cvd_rate:  Number(N(r.cvd_rate) ?? 0),
  }));
}

function normalizeLifestyleRows(rows?: DashboardLifestyleRow[]): DashboardLifestyleRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    label:       String(r.label),
    cvd_with:    Number(N(r.cvd_with)    ?? 0),
    cvd_without: Number(N(r.cvd_without) ?? 0),
  }));
}

const ICON_USERS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <path d="M20 8v6M23 11h-6" />
  </svg>
);

const ICON_HEART = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 21s-7-4.5-9.5-9C0.5 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4 4.5 8-2.5 4.5-9.5 9-9.5 9z" />
  </svg>
);

const ICON_AGE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

const ICON_SCALE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M7 6L5 11h6L9 6M17 6l-2 5h6l-2-5" />
    <path d="M12 2v4M12 22V8" />
    <path d="M9 22h6" />
  </svg>
);

const ICON_BP = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

const ICON_REFRESH = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 109-9" />
    <path d="M3 3v6h6" />
  </svg>
);

const ICON_AUC = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18" />
    <path d="M3 21C7 21 9 5 21 5" />
  </svg>
);

const ICON_F1 = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9"  cy="9"  r="6" />
    <circle cx="15" cy="15" r="6" />
  </svg>
);

const ICON_TARGET = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

const ICON_RECALL = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h12a4 4 0 010 8H8" />
    <path d="M8 10l-4 4 4 4" />
  </svg>
);

const ICON_WARN = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5" />
    <circle cx="12" cy="18" r="0.8" fill="currentColor" />
  </svg>
);

interface Meta {
  cached: boolean;
  generatedAt: string | null;
}

export default function Dashboard() {
  const [state, setState]   = useState<DashboardState>('loading');
  const [data, setData]     = useState<DashboardResponse | null>(null);
  const [error, setError]   = useState<string>('');
  const [meta, setMeta]     = useState<Meta>({ cached: false, generatedAt: null });
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Model info is intentionally INDEPENDENT of the main dashboard state — if
  // MLflow is unreachable we still render the analytics charts above and just
  // show a small inline notice in place of the model section.
  const [modelInfo, setModelInfo]           = useState<ModelInfoResponse | null>(null);
  const [modelState, setModelState]         = useState<ModelInfoState>('loading');
  const [modelError, setModelError]         = useState<string>('');

  // Re-run the reveal observer every time we transition state (e.g. loading
  // → ready), because the elements with .reveal are rendered conditionally
  // and don't exist on initial mount.
  useReveal([state, modelState]);

  const load = useCallback(async (refresh: boolean = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setState('loading');

      const json = await fetchDashboard({ refresh });
      setData(json);
      setMeta({ cached: json.cached, generatedAt: json.generatedAt });
      setState('ready');
    } catch (e) {
      console.error('[Dashboard]', e);
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const loadModel = useCallback(async (refresh: boolean = false) => {
    try {
      if (!refresh) setModelState('loading');
      const json = await fetchModelInfo({ refresh });
      setModelInfo(json);
      setModelState('ready');
    } catch (e) {
      console.error('[Dashboard][model]', e);
      setModelError(e instanceof Error ? e.message : String(e));
      setModelState('error');
    }
  }, []);

  useEffect(() => {
    load(false);
    loadModel(false);
  }, [load, loadModel]);

  // -------- Loading --------
  if (state === 'loading') {
    return (
      <main className="predict-page">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Dashboard analítico</span>
            <h2>Cargando datos del modelo estrella</h2>
            <p className="lead">
              El warehouse SQL de Databricks puede tardar un momento en arrancar si estaba detenido.
              Estamos consultando <code>gold.fct_cardio_outcomes</code> y sus dimensiones.
            </p>
          </div>
          <div className="dashboard-loading glass">
            <div className="spinner"></div>
            <p>Ejecutando queries agregadas…</p>
          </div>
        </div>
      </main>
    );
  }

  // -------- Error --------
  if (state === 'error') {
    return (
      <main className="predict-page">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Dashboard analítico</span>
            <h2>No se pudo cargar el dashboard</h2>
          </div>
          <div className="dashboard-error glass">
            <p>La consulta al warehouse SQL falló:</p>
            <div className="err-msg">{error}</div>
            <button className="btn btn-ghost" onClick={() => load(false)} type="button">
              {ICON_REFRESH} Reintentar
            </button>
          </div>
        </div>
      </main>
    );
  }

  // -------- Ready --------
  const k: Partial<DashboardKpi> = data?.kpis?.[0] || {};
  const ageData  = normalizeCategoryRows(data?.ageGroup);
  const genData  = normalizeCategoryRows(data?.gender);
  const cholData = normalizeCategoryRows(data?.cholesterol);
  const glucData = normalizeCategoryRows(data?.glucose);
  const bmiData  = normalizeCategoryRows(data?.bmi);
  const lifeData = normalizeLifestyleRows(data?.lifestyle);
  const riskData = normalizeCategoryRows(data?.riskFactors);

  const totalPatients = N(k.total_patients);
  const avgAge        = N(k.avg_age);
  const avgBmi        = N(k.avg_bmi);
  const cvdRate       = N(k.cvd_rate);
  const avgSys        = N(k.avg_systolic);
  const avgDia        = N(k.avg_diastolic);

  return (
    <main className="predict-page">
      <div className="container">
        <div className="dashboard-head reveal">
          <div>
            <span className="eyebrow">Dashboard analítico</span>
            <h2>Modelo estrella</h2>
            <p className="lead">
              Información Analítica y KPIs
            </p>
          </div>
          <div className="dashboard-meta">
            <div className="meta-pill">
              <span className={`dot ${meta.cached ? 'cache' : 'fresh'}`}></span>
              {meta.cached ? 'Desde caché' : 'Datos en vivo'}
            </div>
            {meta.generatedAt ? (
              <div className="meta-time">
                Actualizado: {new Date(meta.generatedAt).toLocaleString('es-CO')}
              </div>
            ) : null}
            <button
              className="btn btn-ghost btn-refresh"
              onClick={() => { load(true); loadModel(true); }}
              disabled={refreshing}
              type="button"
            >
              {ICON_REFRESH}
              {refreshing ? 'Actualizando…' : 'Refrescar'}
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="kpi-grid reveal">
          <KpiCard
            label="Pacientes en el modelo"
            value={totalPatients}
            format="integer"
            icon={ICON_USERS}
            accent="primary"
          />
          <KpiCard
            label="Tasa de ECV"
            value={cvdRate}
            format="percent"
            icon={ICON_HEART}
            accent="cvd"
            sub={cvdRate != null && totalPatients != null
              ? `≈ ${Math.round(cvdRate * totalPatients).toLocaleString('es-CO')} casos positivos`
              : null}
          />
          <KpiCard
            label="Edad promedio"
            value={avgAge}
            format="integer"
            icon={ICON_AGE}
            accent="secondary"
            sub="años"
          />
          <KpiCard
            label="BMI promedio"
            value={avgBmi}
            format="decimal"
            icon={ICON_SCALE}
            accent="accent"
            sub={avgBmi !== null
              ? (avgBmi < 18.5 ? 'Bajo peso'
              :  avgBmi < 25   ? 'Normal'
              :  avgBmi < 30   ? 'Sobrepeso'
              :                  'Obesidad')
              : null}
          />
        </div>

        <div className="kpi-bp reveal glass">
          <div className="kpi-icon">{ICON_BP}</div>
          <div>
            <div className="kpi-label">Presión arterial media</div>
            <div className="kpi-bp-vals">
              <span>{avgSys !== null ? avgSys.toFixed(0) : '—'}</span>
              <span className="slash">/</span>
              <span>{avgDia !== null ? avgDia.toFixed(0) : '—'}</span>
              <span className="unit">mmHg</span>
            </div>
          </div>
          <div className="kpi-bp-meter">
            <div className="bp-range">
              <div className="bp-fill" style={{
                width: `${avgSys !== null ? Math.min(100, ((avgSys - 80) / 100) * 100) : 0}%`,
              }} />
            </div>
            <div className="bp-marks"><span>80</span><span>120</span><span>140</span><span>180</span></div>
          </div>
        </div>

        {/* Charts */}
        <div className="chart-grid reveal">
          <ChartCard
            span={2}
            eyebrow="Distribución demográfica"
            title="Pacientes y tasa de ECV por grupo de edad"
            subtitle="La línea coral marca el porcentaje con ECV dentro del grupo."
          >
            <CvdByCategoryChart data={ageData} />
          </ChartCard>

          <ChartCard
            eyebrow="Género"
            title="Composición de la población"
            subtitle="Distribución total con la tasa de ECV por segmento."
          >
            <DonutChart data={genData} />
          </ChartCard>

          <ChartCard
            eyebrow="Lípidos"
            title="Riesgo según colesterol"
            subtitle="Tasa de ECV por nivel reportado."
          >
            <RateBarChart data={cholData} />
          </ChartCard>

          <ChartCard
            eyebrow="Glucemia"
            title="Riesgo según glucosa"
            subtitle="Tasa de ECV por nivel reportado."
          >
            <RateBarChart data={glucData} />
          </ChartCard>

          <ChartCard
            eyebrow="Antropometría"
            title="Pacientes y ECV por rango de BMI"
            subtitle="Clasificación estándar OMS sobre el BMI calculado en la capa silver."
          >
            <CvdByCategoryChart data={bmiData} colorBase={palette.secondary} accent={palette.cvd} />
          </ChartCard>

          <ChartCard
            span={2}
            eyebrow="Hábitos y comorbilidades"
            title="Impacto de hábitos de vida sobre la tasa de ECV"
            subtitle="Comparación entre presentar o no cada condición. Diferencias grandes indican alta sensibilidad al factor."
          >
            <LifestyleChart data={lifeData} />
          </ChartCard>

          <ChartCard
            eyebrow="Riesgo acumulado"
            title="ECV según número de factores de riesgo"
            subtitle="Factores: tabaquismo, alcohol, sedentarismo e hipertensión. La tasa de ECV escala al acumularlos."
          >
            <CvdByCategoryChart data={riskData} colorBase={palette.accent} accent={palette.cvd} />
          </ChartCard>
        </div>

        {/* ============================================================
            Model section — model card + metrics + feature importance
            Decoupled from the dashboard data so a model-registry hiccup
            doesn't take the charts down with it.
            ============================================================ */}
        <div className="model-section-head reveal">
          <span className="eyebrow">Sobre el modelo</span>
          <h3>Modelo @champion en producción</h3>
          <p>
            Información del modelo activo: versión, algoritmo ganador, métricas de test y las
            variables que más pesan en su decisión.
          </p>
        </div>

        {modelState === 'ready' && modelInfo ? (
          <>
            <ModelCardBanner info={modelInfo} />

            <div className="model-metrics-grid reveal">
              <KpiCard
                label="ROC-AUC"
                value={modelInfo.metrics.roc_auc}
                format="percent"
                icon={ICON_AUC}
                accent="primary"
                sub="Capacidad de discriminar clases"
              />
              <KpiCard
                label="F1 score"
                value={modelInfo.metrics.f1}
                format="percent"
                icon={ICON_F1}
                accent="secondary"
                sub="Balance precisión / recall"
              />
              <KpiCard
                label="Precisión"
                value={modelInfo.metrics.precision}
                format="percent"
                icon={ICON_TARGET}
                accent="accent"
                sub="Acierto entre positivos predichos"
              />
              <KpiCard
                label="Recall"
                value={modelInfo.metrics.recall}
                format="percent"
                icon={ICON_RECALL}
                accent="cvd"
                sub="Cobertura de positivos reales"
              />
            </div>

            <div className="model-chart-grid reveal">
              <ChartCard
                eyebrow="Interpretabilidad"
                title="Variables más influyentes"
                subtitle="Features ordenadas por su importancia (gain) según el modelo entrenado."
              >
                <FeatureImportanceChart data={modelInfo.feature_importance} />
              </ChartCard>

              <ChartCard
                eyebrow="Calibración del umbral"
                title="Precisión, recall y F1 vs umbral"
                subtitle="Cómo varían las métricas al mover el umbral de decisión. La línea marca el umbral óptimo elegido."
              >
                <ThresholdSweepChart
                  data={modelInfo.threshold_sweep}
                  optimal={modelInfo.optimal_threshold}
                />
              </ChartCard>
            </div>
          </>
        ) : modelState === 'loading' ? (
          <div className="dashboard-loading glass reveal">
            <div className="spinner"></div>
            <p>Consultando el registro de MLflow…</p>
          </div>
        ) : (
          <div className="model-section-error glass reveal">
            <span className="err-icon">{ICON_WARN}</span>
            <div>
              <strong>No se pudo cargar la información del modelo.</strong>
              <div style={{ fontSize: '0.84rem', color: 'var(--c-text-3)', marginTop: 4 }}>
                {modelError ? <code>{modelError}</code> : 'Reintentando en el próximo refresh.'}
              </div>
            </div>
          </div>
        )}

        <p className="dashboard-footnote">
          Fuente: <code>databricks_service_pf.gold.fct_cardio_outcomes</code> · vista filtrada a registros vigentes (SCD2)
          de los últimos 3 años. Las dimensiones se enriquecen con <code>gold.dim_*</code>.
          {modelInfo?.training_run_id ? (
            <> · Modelo: <code>{modelInfo.model_name} v{modelInfo.version}</code></>
          ) : null}
        </p>
      </div>
    </main>
  );
}
