import {
  ResponsiveContainer,
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { palette } from '../../theme';
import GlassTooltip from './GlassTooltip';
import type { ThresholdSweepRow } from '../../types';

const pct = (v: number | undefined): string => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

// Pill marker sitting at the top of the optimal-threshold reference line,
// rendered inside the plot area so it never collides with the card header.
interface MarkerProps {
  viewBox?: { x?: number; y?: number };
  value?: number;
}
function OptimalMarker({ viewBox, value }: MarkerProps) {
  const x = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;
  const text = `Óptimo ${Number(value).toFixed(2)}`;
  const w = 84;
  return (
    <g transform={`translate(${x}, ${y + 6})`}>
      <rect x={-w / 2} y={0} width={w} height={22} rx={11}
            fill="rgba(42, 42, 58, 0.92)" />
      <text x={0} y={15} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
        {text}
      </text>
    </g>
  );
}

interface ThresholdSweepChartProps {
  data: ThresholdSweepRow[];
  optimal: number | null;
}

export default function ThresholdSweepChart({ data, optimal }: ThresholdSweepChartProps) {
  if (!data?.length) {
    return (
      <div className="chart-empty">
        <p>Curva de umbral no disponible para esta versión.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 18, right: 18, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id="f1Fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={palette.cvd} stopOpacity={0.28} />
            <stop offset="100%" stopColor={palette.cvd} stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="threshold"
          type="number"
          domain={[data[0].threshold, data[data.length - 1].threshold]}
          ticks={[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]}
          tick={{ fontSize: 11, fill: palette.text3 }}
          tickLine={false}
          axisLine={{ stroke: palette.grid }}
          tickFormatter={(v: number) => v.toFixed(1)}
        />
        <YAxis
          domain={[0, 1]}
          ticks={[0, 0.25, 0.5, 0.75, 1]}
          tick={{ fontSize: 11, fill: palette.text3 }}
          tickLine={false}
          axisLine={{ stroke: palette.grid }}
          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
          width={42}
        />
        <Tooltip
          content={
            <GlassTooltip
              dedupe
              formatLabel={(l) => `Umbral ${Number(l).toFixed(2)}`}
              formatValue={(v) => pct(v)}
            />
          }
          cursor={{ stroke: palette.grid, strokeWidth: 1 }}
        />
        <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} iconType="plainline" />

        {optimal !== null ? (
          <ReferenceLine
            x={optimal}
            stroke={palette.text3}
            strokeDasharray="5 4"
            strokeWidth={1.5}
            label={<OptimalMarker value={optimal} />}
            ifOverflow="extendDomain"
          />
        ) : null}

        {/* F1 — the optimised metric: bold line + soft gradient fill. */}
        <Area
          type="monotone" dataKey="f1" name="F1"
          stroke={palette.cvd} strokeWidth={3}
          fill="url(#f1Fill)"
          dot={false} activeDot={{ r: 5 }} animationDuration={900}
        />
        {/* Precision & recall — thin reference lines. */}
        <Line
          type="monotone" dataKey="precision" name="Precisión"
          stroke={palette.primary} strokeWidth={2} dot={false}
          animationDuration={900}
        />
        <Line
          type="monotone" dataKey="recall" name="Recall"
          stroke={palette.secondary} strokeWidth={2} strokeDasharray="6 4" dot={false}
          animationDuration={900}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
