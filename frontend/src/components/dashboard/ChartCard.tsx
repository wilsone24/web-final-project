import type { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  children: ReactNode;
  span?: 1 | 2 | 3;
}

export default function ChartCard({ title, subtitle, eyebrow, children, span = 1 }: ChartCardProps) {
  return (
    <div className={`chart-card glass chart-span-${span}`}>
      <div className="chart-card-head">
        {eyebrow ? <span className="eyebrow chart-eyebrow">{eyebrow}</span> : null}
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className="chart-card-body">
        {children}
      </div>
    </div>
  );
}
