import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import type { PredictFormState, PredictionPayload } from '../types';

const ageGroupId = (years: number): number => {
  if (years < 30) return 1;
  if (years < 45) return 2;
  if (years < 60) return 3;
  if (years < 75) return 4;
  return 5;
};

const ageGroupLabel = (id: number | null): string => {
  if (id === null) return '—';
  const map: Record<number, string> = { 1: '<30', 2: '30-44', 3: '45-59', 4: '60-74', 5: '≥75' };
  return map[id] || '—';
};

const toNum = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

const initialState: PredictFormState = {
  age: '',
  height: '',
  weight: '',
  apHi: '',
  apLo: '',
  gender: '1',
  cholesterol: '1',
  gluc: '1',
  smoker: '0',
  alcohol: '0',
  active: '1',
};

interface Computed {
  bmi: number;
  pp: number;
  ageGid: number | null;
  htn: boolean | null;
  age: number;
  h: number;
  w: number;
  sys: number;
  dia: number;
}

interface PredictFormProps {
  onSubmit: (payload: PredictionPayload) => void;
  isLoading: boolean;
}

export default function PredictForm({ onSubmit, isLoading }: PredictFormProps) {
  const [form, setForm]   = useState<PredictFormState>(initialState);
  const [error, setError] = useState<string>('');

  const set = (field: keyof PredictFormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const computed: Computed = useMemo(() => {
    const age = toNum(form.age);
    const h   = toNum(form.height);
    const w   = toNum(form.weight);
    const sys = toNum(form.apHi);
    const dia = toNum(form.apLo);

    const bmi    = (h > 0 && w > 0) ? w / Math.pow(h / 100, 2) : NaN;
    const pp     = (Number.isFinite(sys) && Number.isFinite(dia)) ? sys - dia : NaN;
    const ageGid = Number.isFinite(age) && age > 0 ? ageGroupId(age) : null;
    const htn    = (Number.isFinite(sys) && Number.isFinite(dia)) ? (sys >= 140 || dia >= 90) : null;

    return { bmi, pp, ageGid, htn, age, h, w, sys, dia };
  }, [form]);

  function validate(): string {
    const { age, h, w, sys, dia } = computed;
    if (!Number.isFinite(age) || age < 1 || age > 120)  return 'Edad debe estar entre 1 y 120 años.';
    if (!Number.isFinite(h) || h < 100 || h > 250)      return 'Altura debe estar entre 100 y 250 cm.';
    if (!Number.isFinite(w) || w < 10 || w > 200)       return 'Peso debe estar entre 10 y 200 kg.';
    if (!Number.isFinite(sys) || sys < 60 || sys > 300) return 'Presión sistólica fuera del rango (60-300).';
    if (!Number.isFinite(dia) || dia < 40 || dia > 200) return 'Presión diastólica fuera del rango (40-200).';
    if (dia >= sys) return 'La presión diastólica debe ser menor que la sistólica.';
    return '';
  }

  function buildPayload(): PredictionPayload {
    const { age, h, w, sys, dia, bmi, pp, ageGid, htn } = computed;
    return {
      age_years:            +age.toFixed(1),
      age_group_id:         ageGid!,
      gender:               parseInt(form.gender, 10),
      height_cm:            Math.round(h),
      weight_kg:            +w.toFixed(1),
      bmi:                  +bmi.toFixed(2),
      systolic_bp:          Math.round(sys),
      diastolic_bp:         Math.round(dia),
      pulse_pressure:       pp,
      hypertension:         htn ? 1 : 0,
      cholesterol:          parseInt(form.cholesterol, 10),
      gluc:                 parseInt(form.gluc, 10),
      is_smoker:            parseInt(form.smoker, 10),
      drinks_alcohol:       parseInt(form.alcohol, 10),
      is_physically_active: parseInt(form.active, 10),
    };
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError('');
    onSubmit(buildPayload());
  }

  const bmiWarn = Number.isFinite(computed.bmi) && (computed.bmi >= 30 || computed.bmi < 18.5);
  const ppWarn  = Number.isFinite(computed.pp)  && (computed.pp < 25 || computed.pp > 60);
  const ageWarn = Number.isFinite(computed.age) && computed.age >= 60;
  const htnWarn = computed.htn === true;

  return (
    <form className="form-card glass reveal" onSubmit={handleSubmit} noValidate>
      <div className="form-head">
        <h2 style={{ fontSize: '1.5rem' }}>Datos del paciente</h2>
        <p>Todos los campos son obligatorios. La información no se almacena.</p>
      </div>

      <div className={`form-error${error ? ' show' : ''}`}>{error}</div>

      {/* Demographics */}
      <div className="form-section">
        <div className="form-section-title">Datos demográficos</div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="age">Edad (años)</label>
            <input id="age" type="number" className="input" min="1" max="120" step="0.1"
                   placeholder="Ej: 52" value={form.age} onChange={set('age')} required />
          </div>
          <div className="field">
            <label>Género</label>
            <div className="pill-group">
              <input type="radio" name="gender" id="gender-f" value="1"
                     checked={form.gender === '1'} onChange={set('gender')} />
              <label htmlFor="gender-f">Femenino</label>
              <input type="radio" name="gender" id="gender-m" value="2"
                     checked={form.gender === '2'} onChange={set('gender')} />
              <label htmlFor="gender-m">Masculino</label>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="form-section">
        <div className="form-section-title">Medidas corporales</div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="height">Altura (cm)</label>
            <input id="height" type="number" className="input" min="100" max="250" step="1"
                   placeholder="Ej: 165" value={form.height} onChange={set('height')} required />
          </div>
          <div className="field">
            <label htmlFor="weight">Peso (kg)</label>
            <input id="weight" type="number" className="input" min="10" max="200" step="0.1"
                   placeholder="Ej: 70" value={form.weight} onChange={set('weight')} required />
          </div>
        </div>
      </div>

      {/* BP */}
      <div className="form-section">
        <div className="form-section-title">Presión arterial</div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="ap-hi">Sistólica (mmHg)</label>
            <input id="ap-hi" type="number" className="input" min="60" max="300" step="1"
                   placeholder="Ej: 120" value={form.apHi} onChange={set('apHi')} required />
            <span className="hint">Valor superior</span>
          </div>
          <div className="field">
            <label htmlFor="ap-lo">Diastólica (mmHg)</label>
            <input id="ap-lo" type="number" className="input" min="40" max="200" step="1"
                   placeholder="Ej: 80" value={form.apLo} onChange={set('apLo')} required />
            <span className="hint">Valor inferior</span>
          </div>
        </div>
      </div>

      {/* Clinical */}
      <div className="form-section">
        <div className="form-section-title">Perfil clínico</div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="cholesterol">Colesterol</label>
            <select id="cholesterol" className="select" value={form.cholesterol} onChange={set('cholesterol')}>
              <option value="1">Normal</option>
              <option value="2">Por encima de lo normal</option>
              <option value="3">Muy por encima de lo normal</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="gluc">Glucosa</label>
            <select id="gluc" className="select" value={form.gluc} onChange={set('gluc')}>
              <option value="1">Normal</option>
              <option value="2">Por encima de lo normal</option>
              <option value="3">Muy por encima de lo normal</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lifestyle */}
      <div className="form-section">
        <div className="form-section-title">Hábitos de vida</div>
        <div className="form-grid">
          <div className="field">
            <label>¿Fuma?</label>
            <div className="pill-group cvd">
              <input type="radio" name="smoker" id="smoker-no" value="0"
                     checked={form.smoker === '0'} onChange={set('smoker')} />
              <label htmlFor="smoker-no" className="option-no">No</label>
              <input type="radio" name="smoker" id="smoker-yes" value="1"
                     checked={form.smoker === '1'} onChange={set('smoker')} />
              <label htmlFor="smoker-yes" className="option-yes">Sí</label>
            </div>
          </div>
          <div className="field">
            <label>¿Consume alcohol?</label>
            <div className="pill-group cvd">
              <input type="radio" name="alcohol" id="alc-no" value="0"
                     checked={form.alcohol === '0'} onChange={set('alcohol')} />
              <label htmlFor="alc-no" className="option-no">No</label>
              <input type="radio" name="alcohol" id="alc-yes" value="1"
                     checked={form.alcohol === '1'} onChange={set('alcohol')} />
              <label htmlFor="alc-yes" className="option-yes">Sí</label>
            </div>
          </div>
          <div className="field full">
            <label>¿Realiza actividad física regularmente?</label>
            <div className="pill-group cvd">
              <input type="radio" name="active" id="act-no" value="0"
                     checked={form.active === '0'} onChange={set('active')} />
              <label htmlFor="act-no" className="option-no">No</label>
              <input type="radio" name="active" id="act-yes" value="1"
                     checked={form.active === '1'} onChange={set('active')} />
              <label htmlFor="act-yes" className="option-yes">Sí</label>
            </div>
          </div>
        </div>
      </div>

      {/* Computed */}
      <div className="computed-row" aria-live="polite">
        <div className="computed">
          <div className="lbl">BMI</div>
          <div className={`val${bmiWarn ? ' warn' : ''}`}>
            {Number.isFinite(computed.bmi) ? computed.bmi.toFixed(1) : '—'}
          </div>
        </div>
        <div className="computed">
          <div className="lbl">Presión pulso</div>
          <div className={`val${ppWarn ? ' warn' : ''}`}>
            {Number.isFinite(computed.pp) ? computed.pp : '—'}
          </div>
        </div>
        <div className="computed">
          <div className="lbl">Grupo edad</div>
          <div className={`val${ageWarn ? ' warn' : ''}`}>
            {ageGroupLabel(computed.ageGid)}
          </div>
        </div>
        <div className="computed">
          <div className="lbl">Hipertensión</div>
          <div className={`val${htnWarn ? ' warn' : ''}`}>
            {computed.htn === null ? '—' : (computed.htn ? 'Sí' : 'No')}
          </div>
        </div>
      </div>

      <div className="form-foot">
        <button type="submit" className="btn btn-primary btn-block" disabled={isLoading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          {isLoading ? 'Prediciendo…' : 'Predecir riesgo cardiovascular'}
        </button>
      </div>
    </form>
  );
}
