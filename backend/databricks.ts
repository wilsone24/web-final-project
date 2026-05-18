import { DBSQLClient } from '@databricks/sql';

const HOST    = process.env.DATABRICKS_SQL_HOST;
const PATH    = process.env.DATABRICKS_SQL_PATH;
const TOKEN   = process.env.DATABRICKS_SQL_TOKEN;
const CATALOG = process.env.DATABRICKS_CATALOG || 'databricks_service_pf';
const SCHEMA  = process.env.DATABRICKS_SCHEMA  || 'gold';

if (!HOST || !PATH || !TOKEN) {
  console.warn(
    '[CardioProxy] Faltan variables DATABRICKS_SQL_HOST / DATABRICKS_SQL_PATH / DATABRICKS_SQL_TOKEN — el dashboard fallará.',
  );
}

const FACT       = `\`${CATALOG}\`.\`${SCHEMA}\`.factcardio`;
const DIM_AGE    = `\`${CATALOG}\`.\`${SCHEMA}\`.dimagegroup`;
const DIM_GENDER = `\`${CATALOG}\`.\`${SCHEMA}\`.dimgender`;
const DIM_CHOL   = `\`${CATALOG}\`.\`${SCHEMA}\`.dimcholesterol`;
const DIM_GLUC   = `\`${CATALOG}\`.\`${SCHEMA}\`.dimglucose`;

// -- Row shapes returned by the SQL warehouse --------------------------------

export interface KpiRow {
  total_patients: number;
  avg_age: number;
  avg_bmi: number;
  cvd_rate: number;
  avg_systolic: number;
  avg_diastolic: number;
}

export interface CategoryRow {
  id: number;
  label: string;
  patients: number;
  cvd_rate: number;
}

export interface LifestyleRow {
  label: string;
  cvd_with: number;
  cvd_without: number;
}

export interface DashboardRows {
  kpis: KpiRow[];
  ageGroup: CategoryRow[];
  gender: CategoryRow[];
  cholesterol: CategoryRow[];
  glucose: CategoryRow[];
  bmi: CategoryRow[];
  lifestyle: LifestyleRow[];
}

// -- Queries -----------------------------------------------------------------

const QUERIES: Record<keyof DashboardRows, string> = {
  kpis: `
    SELECT
      COUNT(*)                                                       AS total_patients,
      AVG(AgeYears)                                                  AS avg_age,
      AVG(BMI)                                                       AS avg_bmi,
      AVG(CASE WHEN HasCardiovascularDisease THEN 1.0 ELSE 0.0 END)  AS cvd_rate,
      AVG(SystolicBP)                                                AS avg_systolic,
      AVG(DiastolicBP)                                               AS avg_diastolic
    FROM ${FACT}
  `,

  ageGroup: `
    SELECT
      d.IdAgeGroup                                                     AS id,
      d.AgeGroupDescription                                            AS label,
      COUNT(*)                                                         AS patients,
      AVG(CASE WHEN f.HasCardiovascularDisease THEN 1.0 ELSE 0.0 END)  AS cvd_rate
    FROM ${FACT} f
    JOIN ${DIM_AGE} d ON f.IdAgeGroup = d.IdAgeGroup
    GROUP BY d.IdAgeGroup, d.AgeGroupDescription
    ORDER BY d.IdAgeGroup
  `,

  gender: `
    SELECT
      d.IdGender                                                       AS id,
      d.GenderDescription                                              AS label,
      COUNT(*)                                                         AS patients,
      AVG(CASE WHEN f.HasCardiovascularDisease THEN 1.0 ELSE 0.0 END)  AS cvd_rate
    FROM ${FACT} f
    JOIN ${DIM_GENDER} d ON f.IdGender = d.IdGender
    GROUP BY d.IdGender, d.GenderDescription
    ORDER BY d.IdGender
  `,

  cholesterol: `
    SELECT
      d.IdCholesterolType                                              AS id,
      d.CholesterolTypeDescription                                     AS label,
      COUNT(*)                                                         AS patients,
      AVG(CASE WHEN f.HasCardiovascularDisease THEN 1.0 ELSE 0.0 END)  AS cvd_rate
    FROM ${FACT} f
    JOIN ${DIM_CHOL} d ON f.IdCholesterolType = d.IdCholesterolType
    GROUP BY d.IdCholesterolType, d.CholesterolTypeDescription
    ORDER BY d.IdCholesterolType
  `,

  glucose: `
    SELECT
      d.IdGlucoseType                                                  AS id,
      d.GlucoseTypeDescription                                         AS label,
      COUNT(*)                                                         AS patients,
      AVG(CASE WHEN f.HasCardiovascularDisease THEN 1.0 ELSE 0.0 END)  AS cvd_rate
    FROM ${FACT} f
    JOIN ${DIM_GLUC} d ON f.IdGlucoseType = d.IdGlucoseType
    GROUP BY d.IdGlucoseType, d.GlucoseTypeDescription
    ORDER BY d.IdGlucoseType
  `,

  bmi: `
    SELECT
      CASE
        WHEN BMI < 18.5 THEN 1
        WHEN BMI < 25   THEN 2
        WHEN BMI < 30   THEN 3
        WHEN BMI < 35   THEN 4
        ELSE                 5
      END                                                              AS id,
      CASE
        WHEN BMI < 18.5 THEN 'Bajo peso'
        WHEN BMI < 25   THEN 'Normal'
        WHEN BMI < 30   THEN 'Sobrepeso'
        WHEN BMI < 35   THEN 'Obesidad I'
        ELSE                 'Obesidad II+'
      END                                                              AS label,
      COUNT(*)                                                         AS patients,
      AVG(CASE WHEN HasCardiovascularDisease THEN 1.0 ELSE 0.0 END)    AS cvd_rate
    FROM ${FACT}
    GROUP BY 1, 2
    ORDER BY 1
  `,

  lifestyle: `
    SELECT
      'Fumadores'      AS label,
      AVG(CASE WHEN IsSmoker            AND HasCardiovascularDisease THEN 1.0 WHEN IsSmoker            THEN 0.0 END) AS cvd_with,
      AVG(CASE WHEN NOT IsSmoker        AND HasCardiovascularDisease THEN 1.0 WHEN NOT IsSmoker        THEN 0.0 END) AS cvd_without
    FROM ${FACT}
    UNION ALL
    SELECT
      'Alcohol',
      AVG(CASE WHEN DrinksAlcohol       AND HasCardiovascularDisease THEN 1.0 WHEN DrinksAlcohol       THEN 0.0 END),
      AVG(CASE WHEN NOT DrinksAlcohol   AND HasCardiovascularDisease THEN 1.0 WHEN NOT DrinksAlcohol   THEN 0.0 END)
    FROM ${FACT}
    UNION ALL
    SELECT
      'Activos',
      AVG(CASE WHEN IsPhysicallyActive       AND HasCardiovascularDisease THEN 1.0 WHEN IsPhysicallyActive       THEN 0.0 END),
      AVG(CASE WHEN NOT IsPhysicallyActive   AND HasCardiovascularDisease THEN 1.0 WHEN NOT IsPhysicallyActive   THEN 0.0 END)
    FROM ${FACT}
    UNION ALL
    SELECT
      'Hipertensos',
      AVG(CASE WHEN HasHypertension          AND HasCardiovascularDisease THEN 1.0 WHEN HasHypertension          THEN 0.0 END),
      AVG(CASE WHEN NOT HasHypertension      AND HasCardiovascularDisease THEN 1.0 WHEN NOT HasHypertension      THEN 0.0 END)
    FROM ${FACT}
  `,
};

// -- Query execution ---------------------------------------------------------

async function runAll(): Promise<DashboardRows> {
  const client = new DBSQLClient();
  await client.connect({ host: HOST!, path: PATH!, token: TOKEN! });

  const session = await client.openSession();

  const out: Partial<DashboardRows> = {};
  try {
    for (const [name, sql] of Object.entries(QUERIES) as Array<[keyof DashboardRows, string]>) {
      const op   = await session.executeStatement(sql, { runAsync: true });
      const rows = await op.fetchAll();
      await op.close();
      // The Databricks driver may return numerics as JS numbers, BigInt or strings.
      // We cast here; consumers downstream are responsible for normalizing.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[name] = rows;
    }
  } finally {
    await session.close().catch(() => {});
    await client.close().catch(() => {});
  }

  return out as DashboardRows;
}

// -- In-memory cache ---------------------------------------------------------

const CACHE_TTL = 5 * 60 * 1000;

interface CacheEntry {
  data: DashboardRows | null;
  ts: number;
  inflight: Promise<DashboardRows> | null;
}

let cache: CacheEntry = { data: null, ts: 0, inflight: null };

export interface DashboardResult {
  data: DashboardRows;
  cached: boolean;
  age: number;
}

export async function getDashboardData(
  { force = false }: { force?: boolean } = {},
): Promise<DashboardResult> {
  const now = Date.now();

  if (!force && cache.data && (now - cache.ts) < CACHE_TTL) {
    return { data: cache.data, cached: true, age: now - cache.ts };
  }

  if (cache.inflight) {
    const data = await cache.inflight;
    return { data, cached: false, age: 0 };
  }

  cache.inflight = runAll();
  try {
    const data = await cache.inflight;
    cache.data = data;
    cache.ts = Date.now();
    return { data, cached: false, age: 0 };
  } finally {
    cache.inflight = null;
  }
}

export function clearDashboardCache(): void {
  cache = { data: null, ts: 0, inflight: null };
}
