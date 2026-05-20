// Shared factor derivation for a prediction record.
// Used by ResultPanel (renders them as pills with icons) and by Predict
// (passes the texts to the /analyze prompt so GPT's narrative is consistent
// with the pills the user sees).

import type { PredictionPayload } from '../types';

export type FactorKind = 'up' | 'down' | 'neutral';

export interface Factor {
  k: FactorKind;
  t: string;
}

export function buildFactors(r: PredictionPayload): Factor[] {
  const items: Factor[] = [];

  if (r.bmi >= 30)        items.push({ k: 'up',   t: `Obesidad (BMI ${r.bmi})` });
  else if (r.bmi >= 25)   items.push({ k: 'up',   t: `Sobrepeso (BMI ${r.bmi})` });
  else if (r.bmi >= 18.5) items.push({ k: 'down', t: `BMI en rango saludable (${r.bmi})` });
  else                    items.push({ k: 'up',   t: `Bajo peso (BMI ${r.bmi})` });

  const isHypertensive = r.systolic_bp >= 140 || r.diastolic_bp >= 90;
  if (isHypertensive)                                       items.push({ k: 'up',      t: `Hipertensión (${r.systolic_bp}/${r.diastolic_bp} mmHg)` });
  else if (r.systolic_bp < 130 && r.diastolic_bp < 85)      items.push({ k: 'down',    t: `Presión arterial normal (${r.systolic_bp}/${r.diastolic_bp} mmHg)` });
  else                                                      items.push({ k: 'neutral', t: `Presión arterial elevada (${r.systolic_bp}/${r.diastolic_bp} mmHg)` });

  if (r.cholesterol === 3)      items.push({ k: 'up',   t: 'Colesterol muy elevado' });
  else if (r.cholesterol === 2) items.push({ k: 'up',   t: 'Colesterol elevado' });
  else                          items.push({ k: 'down', t: 'Colesterol normal' });

  if (r.gluc === 3)      items.push({ k: 'up', t: 'Glucosa muy elevada' });
  else if (r.gluc === 2) items.push({ k: 'up', t: 'Glucosa elevada' });

  if (r.is_smoker)            items.push({ k: 'up',   t: 'Fumador activo' });
  if (r.drinks_alcohol)       items.push({ k: 'up',   t: 'Consumo de alcohol' });
  if (r.is_physically_active) items.push({ k: 'down', t: 'Actividad física regular' });
  else                        items.push({ k: 'up',   t: 'Sedentarismo' });

  if (r.age_years >= 60) items.push({ k: 'up', t: `Edad ${r.age_years.toFixed(0)} años (grupo de mayor riesgo)` });

  return items;
}

/** Same logic as buildFactors but returns just the text strings — useful for
 *  passing to the GPT prompt. */
export function buildFactorTexts(r: PredictionPayload): string[] {
  return buildFactors(r).map((f) => f.t);
}
