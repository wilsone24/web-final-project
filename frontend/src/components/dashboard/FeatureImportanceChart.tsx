import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { palette } from '../../theme';
import type { FeatureImportanceRow } from '../../types';

// Human-friendly labels for the raw feature names produced by the training
// pipeline. Kept here (not in the backend) because they're a presentation
// concern — the model schema stays the same.
const FEATURE_LABELS: Record<string, string> = {
  age_years:            'Edad (años)',
  gender:               'Género',
  height_cm:            'Estatura (cm)',
  weight_kg:            'Peso (kg)',
  bmi:                  'IMC',
  systolic_bp:          'Presión sistólica',
  diastolic_bp:         'Presión diastólica',
  cholesterol:          'Colesterol',
  gluc:                 'Glucosa',
  is_smoker:            'Fumador',
  drinks_alcohol:       'Alcohol',
  is_physically_active: 'Actividad física',
};

function prettyLabel(raw: string): string {
  return FEATURE_LABELS[raw] || raw;
}

interface TooltipEntry { value?: number; payload?: { feature?: string } }
interface GlassTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
}

function GlassTooltip({ active, payload }: GlassTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const entry  = payload[0];
  const value  = entry.value ?? 0;
  const label  = entry.payload?.feature ? prettyLabel(entry.payload.feature) : '';
  return (
    <div className="tt-card">
      <div className="tt-label">{label}</div>
      <div className="tt-row">
        <span className="tt-dot" style={{ background: palette.secondary }} />
        <span className="tt-name">Importancia</span>
        <span className="tt-value">{(value * 100).toFixed(2)}%</span>
      </div>
    </div>
  );
}

interface FeatureImportanceChartProps {
  data: FeatureImportanceRow[];
}

export default function FeatureImportanceChart({ data }: FeatureImportanceChartProps) {
  // Backend returns features sorted descending by importance. Recharts'
  // vertical BarChart places data[0] at the top of the Y axis, which is
  // exactly what we want — highest importance up top, lowest at the bottom.
  const chartData = useMemo(
    () => data.map((r) => ({ ...r, label: prettyLabel(r.feature) })),
    [data],
  );

  if (!chartData.length) {
    return (
      <div className="chart-empty">
        <p>Feature importance no disponible para esta versión.</p>
      </div>
    );
  }

  const maxImp = Math.max(...chartData.map((r) => r.importance));

  // Pastel gradient: lavender for the strongest feature, fading toward primary
  // for the weakest. Computed per-row so the eye instantly maps colour → rank.
  const colorFor = (imp: number): string => {
    const t = maxImp > 0 ? imp / maxImp : 0;
    if (t > 0.66) return palette.secondary;
    if (t > 0.33) return palette.primary;
    return palette.mint;
  };

  const height = Math.max(260, chartData.length * 32);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 8, right: 24, left: 8, bottom: 4 }}
      >
        <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: palette.text3 }}
          tickLine={false}
          axisLine={{ stroke: palette.grid }}
          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fontSize: 12, fill: palette.text2 }}
          tickLine={false}
          axisLine={{ stroke: palette.grid }}
          width={140}
        />
        <Tooltip content={<GlassTooltip />} cursor={{ fill: 'rgba(195, 188, 229, 0.10)' }} />
        <Bar
          dataKey="importance"
          radius={[0, 8, 8, 0]}
          animationDuration={900}
        >
          {chartData.map((row, i) => (
            <Cell key={i} fill={colorFor(row.importance)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
