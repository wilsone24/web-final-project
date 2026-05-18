import { useEffect, useMemo, useState } from 'react';
import type { PredictionPayload, PredictionResult, ResultState } from '../types';

const CIRC = 2 * Math.PI * 80;

type RiskLevel = 'low' | 'mid' | 'high';
type FactorKind = 'up' | 'down' | 'neutral';

interface Factor {
  k: FactorKind;
  t: string;
}

function classifyRisk(p: number): RiskLevel {
  if (p < 0.35) return 'low';
  if (p < 0.65) return 'mid';
  return 'high';
}

function buildFactors(r: PredictionPayload): Factor[] {
  const items: Factor[] = [];
  if (r.bmi >= 30)        items.push({ k: 'up',   t: `Obesidad (BMI ${r.bmi})` });
  else if (r.bmi >= 25)   items.push({ k: 'up',   t: `Sobrepeso (BMI ${r.bmi})` });
  else if (r.bmi >= 18.5) items.push({ k: 'down', t: `BMI en rango saludable (${r.bmi})` });
  else                     items.push({ k: 'up',   t: `Bajo peso (BMI ${r.bmi})` });

  if (r.hypertension) items.push({ k: 'up', t: `Hipertensión (${r.systolic_bp}/${r.diastolic_bp} mmHg)` });
  else if (r.systolic_bp < 130 && r.diastolic_bp < 85) items.push({ k: 'down', t: `Presión arterial normal (${r.systolic_bp}/${r.diastolic_bp} mmHg)` });
  else items.push({ k: 'neutral', t: `Presión arterial elevada (${r.systolic_bp}/${r.diastolic_bp} mmHg)` });

  if (r.cholesterol === 3)      items.push({ k: 'up', t: 'Colesterol muy elevado' });
  else if (r.cholesterol === 2) items.push({ k: 'up', t: 'Colesterol elevado' });
  else                           items.push({ k: 'down', t: 'Colesterol normal' });

  if (r.gluc === 3)      items.push({ k: 'up', t: 'Glucosa muy elevada' });
  else if (r.gluc === 2) items.push({ k: 'up', t: 'Glucosa elevada' });

  if (r.is_smoker)            items.push({ k: 'up',   t: 'Fumador activo' });
  if (r.drinks_alcohol)       items.push({ k: 'up',   t: 'Consumo de alcohol' });
  if (r.is_physically_active) items.push({ k: 'down', t: 'Actividad física regular' });
  else                         items.push({ k: 'up',   t: 'Sedentarismo' });

  if (r.age_years >= 60) items.push({ k: 'up', t: `Edad ${r.age_years.toFixed(0)} años (grupo de mayor riesgo)` });

  return items;
}

function FactorIcon({ kind }: { kind: FactorKind }) {
  if (kind === 'up') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17L17 7M17 7H8M17 7v9" />
    </svg>
  );
  if (kind === 'down') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 7L7 17M7 17h9M7 17V8" />
    </svg>
  );
  return <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4" /></svg>;
}

interface ResultPanelProps {
  state: ResultState;
  result: PredictionResult | null;
  error: string;
  record: PredictionPayload | null;
  onReset: () => void;
  onRetry: () => void;
}

export default function ResultPanel({ state, result, error, record, onReset, onRetry }: ResultPanelProps) {
  const [displayPct, setDisplayPct] = useState<number>(0);

  useEffect(() => {
    if (state !== 'done' || !result) {
      setDisplayPct(0);
      return;
    }
    const target = result.probability * 100;
    const dur = 1100;
    const startTs = performance.now();
    let raf: number | undefined;
    const tick = (t: number) => {
      const p = Math.min(1, (t - startTs) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayPct(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { if (raf !== undefined) cancelAnimationFrame(raf); };
  }, [state, result]);

  const risk: RiskLevel = result ? classifyRisk(result.probability) : 'low';
  const offset           = result ? CIRC * (1 - result.probability) : CIRC;
  const factors          = useMemo<Factor[]>(
    () => (result && record) ? buildFactors(record) : [],
    [result, record],
  );

  const verdictText =
    risk === 'low' ? 'Riesgo bajo' :
    risk === 'mid' ? 'Riesgo moderado' :
                     'Riesgo alto';

  return (
    <aside className="result-panel glass reveal" data-state={state}>

      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="gradGreen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#B5E8D5" />
            <stop offset="100%" stopColor="#6FC598" />
          </linearGradient>
          <linearGradient id="gradAmber" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#FCEFD9" />
            <stop offset="100%" stopColor="#F4B58D" />
          </linearGradient>
          <linearGradient id="gradRed" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#F8C8C8" />
            <stop offset="100%" stopColor="#EE9695" />
          </linearGradient>
        </defs>
      </svg>

      <div className="result-empty">
        <div className="ghost-heart">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s-7-4.5-9.5-9C0.5 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4 4.5 8-2.5 4.5-9.5 9-9.5 9z" />
          </svg>
        </div>
        <h3>Esperando datos</h3>
        <p>Completa el formulario y obtendrás tu resultado aquí mismo.</p>
      </div>

      <div className="result-loading">
        <div className="spinner"></div>
        <p>Analizando con el modelo XGBoost…</p>
      </div>

      <div className="result-done">
        <div className="gauge" data-risk={risk}>
          <svg viewBox="0 0 200 200">
            <circle className="gauge-track" cx="100" cy="100" r="80" />
            <circle
              className="gauge-fill"
              cx="100" cy="100" r="80"
              style={{ strokeDasharray: CIRC, strokeDashoffset: offset }}
            />
          </svg>
          <div className="gauge-center">
            <div>
              <div className="gauge-pct">{displayPct.toFixed(1)}%</div>
              <div className="gauge-lbl">Probabilidad CVD</div>
            </div>
          </div>
        </div>

        <div className={`verdict ${risk}`}>
          <span className="dot"></span>
          <span>{verdictText}</span>
        </div>

        <h3>
          {result?.prediction === 1
            ? 'Indicios de enfermedad cardiovascular'
            : 'Sin indicios significativos'}
        </h3>
        <p className="summary">
          {result?.prediction === 1
            ? 'El modelo clasifica este perfil como positivo. Recomendamos consultar un profesional de la salud para una evaluación.'
            : 'El modelo clasifica este perfil como negativo. Mantén tus hábitos saludables y revisiones periódicas.'}
        </p>

        <div className="factor-list">
          {factors.map((f, i) => (
            <div className={`factor ${f.k}`} key={i}>
              <span className="factor-icon"><FactorIcon kind={f.k} /></span>
              <span className="factor-text">{f.t}</span>
            </div>
          ))}
        </div>

        <div className="result-actions">
          <button className="btn btn-ghost" type="button" onClick={onReset}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 109-9" />
              <path d="M3 3v6h6" />
            </svg>
            Nueva predicción
          </button>
        </div>

        <p className="disclaimer">
          ⚕️ Este resultado es una estimación estadística con fines educativos. No reemplaza la evaluación de un profesional de la salud.
        </p>
      </div>

      <div className="result-error">
        <div className="ghost-heart" style={{ color: '#B0524F', borderColor: 'rgba(238,150,149,0.4)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <h3>No se pudo predecir</h3>
        <p>La petición al endpoint falló. Detalles abajo:</p>
        <div className="err-msg">{error}</div>
        <div className="result-actions">
          <button className="btn btn-ghost" type="button" onClick={onRetry}>Reintentar</button>
        </div>
      </div>
    </aside>
  );
}
