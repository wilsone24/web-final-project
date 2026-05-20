// Column mapping + validation for batch CSV uploads.
//
// Accepts liberal column-name variants (Age, age_years, ap_hi, SystolicBP …)
// and maps them to the 12 canonical fields the Databricks endpoint expects.
// Computes BMI from height + weight if the CSV doesn't include it.

import type { PredictionPayload } from '../types';

export const CANONICAL_FIELDS: Array<keyof PredictionPayload> = [
  'age_years', 'gender', 'height_cm', 'weight_kg', 'bmi',
  'systolic_bp', 'diastolic_bp',
  'cholesterol', 'gluc',
  'is_smoker', 'drinks_alcohol', 'is_physically_active',
];

// All keys here are normalised (lowercase, alphanumeric only) so a header like
// "Systolic BP" or "ap_hi" both resolve to the same canonical field.
const ALIASES: Record<string, keyof PredictionPayload> = {
  age:               'age_years',
  ageyears:          'age_years',
  edad:              'age_years',

  gender:            'gender',
  sex:              'gender',
  sexo:              'gender',
  idgender:          'gender',

  height:            'height_cm',
  heightcm:          'height_cm',
  altura:            'height_cm',

  weight:            'weight_kg',
  weightkg:          'weight_kg',
  peso:              'weight_kg',

  bmi:               'bmi',
  imc:               'bmi',

  aphi:              'systolic_bp',
  systolic:          'systolic_bp',
  systolicbp:        'systolic_bp',
  sistolica:         'systolic_bp',
  sistólica:         'systolic_bp',

  aplo:              'diastolic_bp',
  diastolic:         'diastolic_bp',
  diastolicbp:       'diastolic_bp',
  diastolica:        'diastolic_bp',
  diastólica:        'diastolic_bp',

  cholesterol:       'cholesterol',
  chol:              'cholesterol',
  idcholesteroltype: 'cholesterol',
  colesterol:        'cholesterol',

  gluc:              'gluc',
  glucose:           'gluc',
  glucosa:           'gluc',
  idglucosetype:     'gluc',

  smoke:             'is_smoker',
  smoker:            'is_smoker',
  issmoker:          'is_smoker',
  fuma:              'is_smoker',
  fumador:           'is_smoker',

  alco:              'drinks_alcohol',
  alcohol:           'drinks_alcohol',
  drinksalcohol:     'drinks_alcohol',

  active:            'is_physically_active',
  isphysicallyactive:'is_physically_active',
  activo:            'is_physically_active',
};

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface MappedRow {
  /** 1-based row number in the original CSV (excluding header). */
  rowIndex: number;
  /** User-supplied id from an `id` / `patient_id` column, otherwise `String(rowIndex)`. */
  id: string;
  /** Original cell values keyed by the header text from the file. */
  raw: Record<string, string>;
  /** Validated payload ready to send. `null` when the row failed validation. */
  payload: PredictionPayload | null;
  /** Human-readable errors (in Spanish). Empty when payload is non-null. */
  errors: string[];
}

export interface MappedCSV {
  headers: string[];
  rows: MappedRow[];
  /** Canonical field → column index in the source headers. */
  columnMap: Map<keyof PredictionPayload, number>;
  /** True iff the source CSV had an `id` / `patient_id` column. */
  hasIdColumn: boolean;
}

export function mapCSV(headers: string[], dataRows: string[][]): MappedCSV {
  const columnMap = new Map<keyof PredictionPayload, number>();
  let idColIdx = -1;

  headers.forEach((h, idx) => {
    const norm = normalize(h);
    if (norm === 'id' || norm === 'patientid') { if (idColIdx < 0) idColIdx = idx; return; }
    const canonical = ALIASES[norm];
    if (canonical && !columnMap.has(canonical)) columnMap.set(canonical, idx);
  });

  const rows: MappedRow[] = dataRows.map((row, i) => mapRow(headers, row, i + 1, columnMap, idColIdx));

  return { headers, rows, columnMap, hasIdColumn: idColIdx >= 0 };
}

function mapRow(
  headers: string[],
  row: string[],
  rowIndex: number,
  columnMap: Map<keyof PredictionPayload, number>,
  idColIdx: number,
): MappedRow {
  const raw: Record<string, string> = {};
  headers.forEach((h, i) => { raw[h] = (row[i] ?? '').trim(); });

  const id = idColIdx >= 0 && row[idColIdx]?.trim() ? row[idColIdx].trim() : String(rowIndex);
  const errors: string[] = [];

  const cell = (key: keyof PredictionPayload): string => {
    const idx = columnMap.get(key);
    return idx === undefined ? '' : (row[idx] ?? '').trim();
  };

  const num = (key: keyof PredictionPayload): number => {
    const s = cell(key);
    if (s === '') return NaN;
    if (key === 'gender') {
      const u = s.toUpperCase();
      if (u === 'F' || u === 'FEMENINO' || u === 'FEMALE') return 1;
      if (u === 'M' || u === 'MASCULINO' || u === 'MALE')   return 2;
    }
    return parseFloat(s.replace(',', '.'));
  };

  const age_years            = num('age_years');
  const gender               = num('gender');
  const height_cm            = num('height_cm');
  const weight_kg            = num('weight_kg');
  let   bmi                  = num('bmi');
  const systolic_bp          = num('systolic_bp');
  const diastolic_bp         = num('diastolic_bp');
  const cholesterol          = num('cholesterol');
  const gluc                 = num('gluc');
  const is_smoker            = num('is_smoker');
  const drinks_alcohol       = num('drinks_alcohol');
  const is_physically_active = num('is_physically_active');

  if (!Number.isFinite(bmi) && Number.isFinite(height_cm) && Number.isFinite(weight_kg) && height_cm > 0) {
    bmi = weight_kg / Math.pow(height_cm / 100, 2);
  }

  const check = (label: string, v: number, lo: number, hi: number, integer = false) => {
    if (!Number.isFinite(v)) { errors.push(`${label} faltante`); return; }
    if (v < lo || v > hi)    { errors.push(`${label} fuera de rango (${lo}–${hi})`); return; }
    if (integer && !Number.isInteger(v)) errors.push(`${label} debe ser entero`);
  };

  check('edad',                age_years,            1, 120);
  if (gender !== 1 && gender !== 2) errors.push('gender debe ser 1 (F) o 2 (M)');
  check('altura',              height_cm,          100, 250);
  check('peso',                weight_kg,           10, 200);
  check('sistólica',           systolic_bp,         60, 300);
  check('diastólica',          diastolic_bp,        40, 200);
  if (Number.isFinite(systolic_bp) && Number.isFinite(diastolic_bp) && diastolic_bp >= systolic_bp) {
    errors.push('diastólica debe ser menor que sistólica');
  }
  check('cholesterol',         cholesterol,          1,   3, true);
  check('gluc',                gluc,                 1,   3, true);
  check('is_smoker',           is_smoker,            0,   1, true);
  check('drinks_alcohol',      drinks_alcohol,       0,   1, true);
  check('is_physically_active',is_physically_active, 0,   1, true);
  check('bmi',                 bmi,                  5,  80);

  if (errors.length > 0) return { rowIndex, id, raw, payload: null, errors };

  const payload: PredictionPayload = {
    age_years:            +age_years.toFixed(1),
    gender,
    height_cm:            Math.round(height_cm),
    weight_kg:            +weight_kg.toFixed(1),
    bmi:                  +bmi.toFixed(2),
    systolic_bp:          Math.round(systolic_bp),
    diastolic_bp:         Math.round(diastolic_bp),
    cholesterol,
    gluc,
    is_smoker,
    drinks_alcohol,
    is_physically_active,
  };
  return { rowIndex, id, raw, payload, errors: [] };
}

/** Returns the canonical fields that are missing from the column map. BMI is
 *  excluded because it can be derived from height + weight. */
export function getMissingRequiredColumns(columnMap: Map<keyof PredictionPayload, number>): string[] {
  return CANONICAL_FIELDS.filter((c) => c !== 'bmi' && !columnMap.has(c));
}

/** CSV the user can download as a starting point. Includes optional id column,
 *  all 12 canonical fields, and two example patients. */
export function buildTemplateCSV(): string {
  const headers = ['id', ...CANONICAL_FIELDS];
  const sample = [
    ['P001', 48.4, 1, 158, 71.0, 28.44, 110,  70, 1, 1, 0, 0, 1],
    ['P002', 62.1, 2, 175, 90.0, 29.39, 150,  95, 2, 1, 1, 1, 0],
    ['P003', 35.0, 1, 165, 58.0, 21.30, 115,  75, 1, 1, 0, 0, 1],
  ];
  return [headers.join(','), ...sample.map((r) => r.join(','))].join('\n');
}
