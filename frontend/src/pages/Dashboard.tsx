import { useEffect, useState, useCallback } from 'react';
import { fetchDashboard } from '../api';
import useReveal from '../hooks/useReveal';
import { palette } from '../theme';
import KpiCard from '../components/dashboard/KpiCard';
import ChartCard from '../components/dashboard/ChartCard';
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
} from '../types';

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

interface Meta {
  cached: boolean;
  generatedAt: string | null;
}

export default function Dashboard() {
  useReveal([]);

  const [state, setState]   = useState<DashboardState>('loading');
  const [data, setData]     = useState<DashboardResponse | null>(null);
  const [error, setError]   = useState<string>('');
  const [meta, setMeta]     = useState<Meta>({ cached: false, generatedAt: null });
  const [refreshing, setRefreshing] = useState<boolean>(false);

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

  useEffect(() => { load(false); }, [load]);

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
              Estamos consultando <code>gold.factcardio</code> y sus dimensiones.
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
            <h2>Modelo estrella · gold.factcardio</h2>
            <p className="lead">
              Métricas agregadas sobre la población clínica completa. Datos cacheados durante 5 minutos
              para no saturar el warehouse SQL.
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
              onClick={() => load(true)}
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
            label="Tasa de CVD"
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
            format="decimal"
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
            title="Pacientes y tasa de CVD por grupo de edad"
            subtitle="La línea coral marca el porcentaje con enfermedad cardiovascular dentro del grupo."
          >
            <CvdByCategoryChart data={ageData} />
          </ChartCard>

          <ChartCard
            eyebrow="Género"
            title="Composición de la población"
            subtitle="Distribución total con la tasa de CVD por segmento."
          >
            <DonutChart data={genData} />
          </ChartCard>

          <ChartCard
            eyebrow="Lípidos"
            title="Riesgo según colesterol"
            subtitle="Tasa de CVD por nivel reportado."
          >
            <RateBarChart data={cholData} />
          </ChartCard>

          <ChartCard
            eyebrow="Glucemia"
            title="Riesgo según glucosa"
            subtitle="Tasa de CVD por nivel reportado."
          >
            <RateBarChart data={glucData} />
          </ChartCard>

          <ChartCard
            eyebrow="Antropometría"
            title="Pacientes y CVD por rango de BMI"
            subtitle="Clasificación estándar OMS sobre el BMI calculado en la capa silver."
          >
            <CvdByCategoryChart data={bmiData} colorBase={palette.secondary} accent={palette.cvd} />
          </ChartCard>

          <ChartCard
            span={2}
            eyebrow="Hábitos y comorbilidades"
            title="Impacto de hábitos de vida sobre la tasa de CVD"
            subtitle="Comparación entre presentar o no cada condición. Diferencias grandes indican alta sensibilidad al factor."
          >
            <LifestyleChart data={lifeData} />
          </ChartCard>
        </div>

        <p className="dashboard-footnote">
          Fuente: <code>databricks_service_pf.gold.factcardio</code> · vista filtrada a registros vigentes (SCD2)
          de los últimos 3 años. Las dimensiones se enriquecen con <code>gold.dim*</code>.
        </p>
      </div>
    </main>
  );
}
