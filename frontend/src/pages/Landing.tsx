import { Link } from 'react-router-dom';
import { useEffect, useRef, type ReactNode } from 'react';
import useReveal from '../hooks/useReveal';

function ArrowRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

interface CounterStatProps {
  target: number;
  suffix?: string;
  children: ReactNode;
}

function CounterStat({ target, suffix = '', children }: CounterStatProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) {
      if (el) el.textContent = (target >= 1000 ? (target / 1000).toFixed(0) + 'k' : String(target)) + suffix;
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const duration = 1400;
        const start = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          const v = Math.floor(target * eased);
          if (el) el.textContent = (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : String(v)) + suffix;
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        io.unobserve(el);
      });
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [target, suffix]);
  return <div className="num" ref={ref}>{children}</div>;
}

export default function Landing() {
  useReveal([]);

  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="container">
          <div className="hero-grid">
            <div className="hero-copy reveal">
              <span className="eyebrow">Powered by Databricks · XGBoost</span>
              <h1>
                Detecta el riesgo cardiovascular con{' '}
                <span className="gradient-text">inteligencia artificial</span>
              </h1>
              <p className="hero-lead">
                CardIAc utiliza un modelo entrenado sobre 70.000 pacientes para estimar la probabilidad
                de enfermedad cardiovascular a partir de signos vitales, perfil clínico y hábitos.
              </p>

              <div className="hero-actions">
                <Link to="/predict" className="btn btn-primary">
                  Empezar predicción
                  <ArrowRight />
                </Link>
                <a href="#pipeline" className="btn btn-ghost">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                  Cómo funciona
                </a>
              </div>

              <div className="hero-stats">
                <div className="stat">
                  <CounterStat target={70000}>70k</CounterStat>
                  <div className="lbl">Pacientes</div>
                </div>
                <div className="stat">
                  <div className="num">15</div>
                  <div className="lbl">Features clínicas</div>
                </div>
                <div className="stat">
                  <div className="num">~73%</div>
                  <div className="lbl">ROC-AUC test</div>
                </div>
              </div>
            </div>

            <div className="hero-visual reveal">
              <span className="ring r3"></span>
              <span className="ring r2"></span>
              <span className="ring r1"></span>
              <div className="heart-orb">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 21s-7-4.5-9.5-9C0.5 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4 4.5 8-2.5 4.5-9.5 9-9.5 9z" />
                </svg>
              </div>
              <div className="metric-chip c1"><span className="dot"></span> 115 / 75 mmHg</div>
              <div className="metric-chip c2 alert"><span className="dot"></span> Riesgo: alto</div>
              <div className="metric-chip c3"><span className="dot"></span> BMI 22.04</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section" id="features">
        <div className="container">
          <div className="section-head reveal">
            <span className="eyebrow">Plataforma</span>
            <h2>Una pipeline completa de extremo a extremo</h2>
            <p className="lead">
              Desde la ingesta de datos hasta el endpoint REST: una arquitectura medallion moderna que limpia,
              enriquece y modela información clínica para producir predicciones confiables.
            </p>
          </div>

          <div className="feature-grid">
            <div className="feature-card glass reveal">
              <div className="feature-icon i-bronze">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                  <path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" />
                </svg>
              </div>
              <h3>Ingesta cruda · Bronze</h3>
              <p>Datos clínicos de Kaggle Cardiovascular Disease cargados directamente desde CSV con esquema tipado y metadatos completos en Unity Catalog.</p>
            </div>

            <div className="feature-card glass reveal">
              <div className="feature-icon i-silver">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
                </svg>
              </div>
              <h3>Limpieza · Silver</h3>
              <p>Imputación de nulos por género, eliminación de outliers fisiológicos, BMI derivado, presión de pulso e hipertensión según criterios ACC/AHA 2017.</p>
            </div>

            <div className="feature-card glass reveal">
              <div className="feature-icon i-gold">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <h3>Modelo estrella · Gold</h3>
              <p>Tabla fact + dimensiones (edad, género, colesterol, glucosa) lista para analítica y feature engineering. Solo registros vigentes vía SCD-2.</p>
            </div>

            <div className="feature-card glass reveal">
              <div className="feature-icon i-eda">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18" />
                  <path d="M7 14l4-4 4 4 5-5" />
                </svg>
              </div>
              <h3>EDA exhaustivo</h3>
              <p>Análisis univariado, bivariado, correlaciones de Spearman y ranking de importancia por información mutua. Todo reproducible en Databricks.</p>
            </div>

            <div className="feature-card glass reveal">
              <div className="feature-icon i-ml">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </div>
              <h3>XGBoost optimizado</h3>
              <p>Hiperparámetros tuneados con Optuna (TPE), umbral de decisión optimizado por F1, validación cruzada estratificada y early stopping.</p>
            </div>

            <div className="feature-card glass reveal">
              <div className="feature-icon i-serve">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
              </div>
              <h3>Servido en tiempo real</h3>
              <p>Modelo registrado en MLflow con gobernanza champion-challenger y expuesto como endpoint REST de Databricks Model Serving.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="section" id="pipeline">
        <div className="container">
          <div className="section-head reveal">
            <span className="eyebrow">Cómo funciona</span>
            <h2>De los datos a la predicción en cuatro pasos</h2>
            <p className="lead">
              Una pipeline pensada para la trazabilidad y la observabilidad. Cada etapa registra metadatos,
              validaciones y linaje en Unity Catalog.
            </p>
          </div>

          <div className="pipeline">
            {([
              ['1', 'Captura', 'Datos clínicos llegan a la capa bronze tal cual, con esquema tipado.'],
              ['2', 'Refinamiento', 'Silver imputa nulos, elimina outliers y deriva BMI, presión de pulso, hipertensión.'],
              ['3', 'Entrenamiento', 'XGBoost vs Random Forest con Optuna, validación cruzada y umbral óptimo.'],
              ['4', 'Predicción', 'El campeón se expone como endpoint REST que tú consumes desde aquí.'],
            ] as const).map(([n, t, d]) => (
              <div className="pipe-step reveal" key={n}>
                <div className="pipe-num">{n}</div>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="section" id="architecture">
        <div className="container">
          <div className="section-head reveal">
            <span className="eyebrow">Arquitectura medallion</span>
            <h2>Tres capas, una sola fuente de verdad</h2>
            <p className="lead">
              Cada capa cumple un propósito específico y entrega un contrato claro a la siguiente. Trazabilidad
              total desde el CSV original hasta la predicción.
            </p>
          </div>

          <div className="arch-grid">
            <div className="layer-card glass reveal">
              <span className="layer-label bronze">● Bronze</span>
              <h3>Datos crudos</h3>
              <p className="desc">70.000 filas del Kaggle Cardiovascular Disease Dataset. Esquema explícito, validación de conteo, metadatos y comentarios por columna.</p>
              <div className="layer-meta">
                <span className="tag">Delta Lake</span>
                <span className="tag">CSV source</span>
                <span className="tag">Schema enforced</span>
              </div>
            </div>

            <div className="layer-card glass reveal">
              <span className="layer-label silver">● Silver</span>
              <h3>Datos limpios y enriquecidos</h3>
              <p className="desc">Imputación inteligente (mediana por género, moda, valores por defecto), filtros fisiológicos, features derivadas y SCD Tipo 2 sobre patient id.</p>
              <div className="layer-meta">
                <span className="tag">Imputación</span>
                <span className="tag">Outlier removal</span>
                <span className="tag">SCD2 merge</span>
              </div>
            </div>

            <div className="layer-card glass reveal">
              <span className="layer-label gold">● Gold</span>
              <h3>Modelo estrella + features ML</h3>
              <p className="desc">Tabla fact con últimos 3 años, dimensiones filtradas por valores presentes y tabla específica de features lista para entrenamiento XGBoost.</p>
              <div className="layer-meta">
                <span className="tag">Star schema</span>
                <span className="tag">Feature table</span>
                <span className="tag">ML ready</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section">
        <div className="container">
          <div className="cta-card glass reveal">
            <h2>¿Listo para probar el modelo?</h2>
            <p>Ingresa tus signos vitales y obtén una predicción individual, o explora los patrones agregados de toda la población clínica en el dashboard analítico.</p>
            <div className="hero-actions" style={{ justifyContent: 'center', marginTop: 0 }}>
              <Link to="/predict" className="btn btn-primary">
                Iniciar predicción
                <ArrowRight />
              </Link>
              <Link to="/dashboard" className="btn btn-ghost">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18" />
                  <path d="M7 14l4-4 4 4 5-5" />
                </svg>
                Ver dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
