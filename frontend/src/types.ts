// Shared types between frontend modules.

export interface PredictionPayload {
  age_years: number;
  gender: number;
  height_cm: number;
  weight_kg: number;
  bmi: number;
  systolic_bp: number;
  diastolic_bp: number;
  cholesterol: number;
  gluc: number;
  is_smoker: number;
  drinks_alcohol: number;
  is_physically_active: number;
}

export interface PredictionResult {
  probability: number;
  prediction: number;
}

// -- Dashboard payload (matches backend/databricks.ts) -----------------------

export interface DashboardKpi {
  total_patients: number;
  avg_age: number;
  avg_bmi: number;
  cvd_rate: number;
  avg_systolic: number;
  avg_diastolic: number;
}

export interface DashboardCategoryRow {
  id: number;
  label: string;
  patients: number;
  cvd_rate: number;
}

export interface DashboardLifestyleRow {
  label: string;
  cvd_with: number;
  cvd_without: number;
}

export interface DashboardResponse {
  cached: boolean;
  cacheAgeMs: number;
  generatedAt: string;
  kpis: DashboardKpi[];
  ageGroup: DashboardCategoryRow[];
  gender: DashboardCategoryRow[];
  cholesterol: DashboardCategoryRow[];
  glucose: DashboardCategoryRow[];
  bmi: DashboardCategoryRow[];
  lifestyle: DashboardLifestyleRow[];
  riskFactors: DashboardCategoryRow[];
}

// Form state (predict page)
export interface PredictFormState {
  age: string;
  height: string;
  weight: string;
  apHi: string;
  apLo: string;
  gender: string;
  cholesterol: string;
  gluc: string;
  smoker: string;
  alcohol: string;
  active: string;
}

export type ResultState = 'empty' | 'loading' | 'done' | 'error';
export type DashboardState = 'loading' | 'ready' | 'error';

// -- Model info payload (matches backend/mlflow.ts) -------------------------

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

export interface ModelInfoResponse {
  cached:             boolean;
  cacheAgeMs:         number;
  generatedAt:        string;
  model_name:         string;
  version:            string;
  algorithm:          string;
  optimal_threshold:  number | null;
  pipeline_version:   string | null;
  champion_since:     string | null;
  training_run_id:    string | null;
  description:        string | null;
  metrics:            ModelMetrics;
  feature_count:      number | null;
  train_rows:         number | null;
  test_rows:          number | null;
  feature_importance: FeatureImportanceRow[];
  threshold_sweep:    ThresholdSweepRow[];
}
