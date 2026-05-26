import type { ReactNode } from 'react';

// Shared glass-styled tooltip for every Recharts chart on the dashboard.
// `GlassTooltip` adapts Recharts' loosely-typed payload into the `.tt-card`
// markup; charts pass `formatLabel` / `formatValue` to control formatting.

export interface TooltipEntry {
  color?: string;
  name?:  string;
  value?: number;
}

interface GlassTooltipProps {
  active?:  boolean;
  payload?: TooltipEntry[];
  label?:   string | number;
  /** Transform the header label (e.g. "Umbral 0.41"). Defaults to the raw label. */
  formatLabel?: (label: string | number | undefined) => ReactNode;
  /** Format each row's value (e.g. as a percentage). Defaults to String(value). */
  formatValue?: (value: number | undefined, name: string | undefined) => ReactNode;
  /** Drop duplicate series by name — Area+Line can emit the same series twice. */
  dedupe?: boolean;
}

export default function GlassTooltip({
  active, payload, label, formatLabel, formatValue, dedupe = false,
}: GlassTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  let entries = payload;
  if (dedupe) {
    const seen = new Set<string>();
    entries = payload.filter((p) => {
      const n = p.name ?? '';
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    });
  }

  return (
    <div className="tt-card">
      <div className="tt-label">{formatLabel ? formatLabel(label) : label}</div>
      {entries.map((p, i) => (
        <div className="tt-row" key={i}>
          <span className="tt-dot" style={{ background: p.color }}></span>
          <span className="tt-name">{p.name}</span>
          <span className="tt-value">
            {formatValue ? formatValue(p.value, p.name) : String(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
