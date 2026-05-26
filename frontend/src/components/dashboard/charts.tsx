import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
  PieChart, Pie,
  Line, ComposedChart,
} from 'recharts';
import { palette } from '../../theme';
import GlassTooltip from './GlassTooltip';
import type { DashboardCategoryRow, DashboardLifestyleRow } from '../../types';

const axisStyle = { fontSize: 11, fill: palette.text3, fontFamily: 'Inter, sans-serif' } as const;
const pct = (v: number | undefined): string => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const intFmt = (v: number | undefined): string => (v == null ? '—' : Number(v).toLocaleString('es-CO'));

// =========================================================
// Bar + Line: patients + CVD rate by category
// =========================================================
interface CvdByCategoryChartProps {
  data: DashboardCategoryRow[];
  labelKey?: keyof DashboardCategoryRow;
  colorBase?: string;
  accent?: string;
}

export function CvdByCategoryChart({
  data,
  labelKey = 'label',
  colorBase = palette.primary,
  accent = palette.cvd,
}: CvdByCategoryChartProps) {
  if (!data?.length) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={labelKey as string} tick={axisStyle} tickLine={false} axisLine={{ stroke: palette.grid }} />
        <YAxis yAxisId="left" tick={axisStyle} tickLine={false} axisLine={{ stroke: palette.grid }}
               tickFormatter={intFmt} width={48} />
        <YAxis yAxisId="right" orientation="right" tick={axisStyle} tickLine={false}
               axisLine={{ stroke: palette.grid }}
               tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
               domain={[0, 1]} width={42} />
        <Tooltip
          content={
            <GlassTooltip
              formatValue={(v, name) => name === 'Tasa ECV' ? pct(v) : intFmt(v)}
            />
          }
          cursor={{ fill: 'rgba(159, 193, 232, 0.08)' }}
        />
        <Legend wrapperStyle={{ paddingTop: 12, fontSize: 12 }} iconType="circle" />
        <Bar
          yAxisId="left"
          dataKey="patients"
          name="Pacientes"
          fill={colorBase}
          radius={[8, 8, 0, 0]}
          animationDuration={900}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="cvd_rate"
          name="Tasa ECV"
          stroke={accent}
          strokeWidth={3}
          dot={{ r: 4, fill: '#fff', stroke: accent, strokeWidth: 2 }}
          activeDot={{ r: 6 }}
          animationDuration={900}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// =========================================================
// Bar chart: CVD rate per category
// =========================================================
interface RateBarChartProps {
  data: DashboardCategoryRow[];
  labelKey?: keyof DashboardCategoryRow;
  barColor?: string;
}

export function RateBarChart({
  data,
  labelKey = 'label',
  barColor = palette.cvd,
}: RateBarChartProps) {
  if (!data?.length) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={labelKey as string} tick={axisStyle} tickLine={false} axisLine={{ stroke: palette.grid }} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={{ stroke: palette.grid }}
               tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} domain={[0, 1]} width={42} />
        <Tooltip content={<GlassTooltip formatValue={(v) => pct(v)} />}
                 cursor={{ fill: 'rgba(238, 150, 149, 0.08)' }} />
        <Bar dataKey="cvd_rate" name="Tasa ECV" fill={barColor}
             radius={[8, 8, 0, 0]} animationDuration={900}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={
                entry.cvd_rate >= 0.5 ? palette.cvd
                : entry.cvd_rate >= 0.35 ? palette.accent
                : palette.noCvd
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// =========================================================
// Donut chart: distribution
// =========================================================
const DONUT_COLORS = [palette.primary, palette.accent, palette.secondary, palette.noCvd] as const;

interface DonutChartProps {
  data: DashboardCategoryRow[];
  nameKey?: keyof DashboardCategoryRow;
  valueKey?: keyof DashboardCategoryRow;
}

export function DonutChart({
  data,
  nameKey = 'label',
  valueKey = 'patients',
}: DonutChartProps) {
  if (!data?.length) return <ChartEmpty />;
  const total = data.reduce((s, d) => s + Number(d[valueKey] ?? 0), 0);

  return (
    <div className="donut-wrap">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey as string}
            nameKey={nameKey as string}
            innerRadius={70}
            outerRadius={100}
            paddingAngle={2}
            cornerRadius={6}
            stroke="rgba(255,255,255,0.5)"
            strokeWidth={2}
            animationDuration={900}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<GlassTooltip formatValue={(v) => intFmt(v)} />} />
        </PieChart>
      </ResponsiveContainer>

      <div className="donut-center">
        <div className="donut-total">{intFmt(total)}</div>
        <div className="donut-lbl">Pacientes</div>
      </div>

      <div className="donut-legend">
        {data.map((d, i) => {
          const value = Number(d[valueKey] ?? 0);
          return (
            <div className="dl-item" key={i}>
              <span className="dl-dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}></span>
              <span className="dl-name">{String(d[nameKey])}</span>
              <span className="dl-val">
                {intFmt(value)}
                <span className="dl-pct">· {((value / total) * 100).toFixed(1)}%</span>
              </span>
              <span className="dl-cvd">{pct(d.cvd_rate)} ECV</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =========================================================
// Grouped bar: lifestyle factors
// =========================================================
interface LifestyleChartProps {
  data: DashboardLifestyleRow[];
}

export function LifestyleChart({ data }: LifestyleChartProps) {
  if (!data?.length) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                barCategoryGap="25%">
        <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={{ stroke: palette.grid }} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={{ stroke: palette.grid }}
               tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} domain={[0, 1]} width={42} />
        <Tooltip content={<GlassTooltip formatValue={(v) => pct(v)} />}
                 cursor={{ fill: 'rgba(159, 193, 232, 0.08)' }} />
        <Legend wrapperStyle={{ paddingTop: 12, fontSize: 12 }} iconType="circle" />
        <Bar dataKey="cvd_with"    name="Con el factor"  fill={palette.cvd}
             radius={[8, 8, 0, 0]} animationDuration={900} />
        <Bar dataKey="cvd_without" name="Sin el factor"  fill={palette.noCvd}
             radius={[8, 8, 0, 0]} animationDuration={900} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartEmpty() {
  return (
    <div className="chart-empty">
      <p>Sin datos disponibles.</p>
    </div>
  );
}
