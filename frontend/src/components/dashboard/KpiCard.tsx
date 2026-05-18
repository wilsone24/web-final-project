import { useEffect, useRef, useState, type ReactNode } from 'react';

type KpiFormat = 'integer' | 'percent' | 'decimal';
type KpiAccent = 'primary' | 'secondary' | 'accent' | 'cvd';

function formatValue(value: number | null, format: KpiFormat): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  switch (format) {
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    case 'integer':
      return Math.round(value).toLocaleString('es-CO');
    case 'decimal':
      return value.toFixed(1);
    default:
      return String(value);
  }
}

interface KpiCardProps {
  label: string;
  value: number | null;
  format?: KpiFormat;
  icon: ReactNode;
  accent?: KpiAccent;
  sub?: string | null;
}

export default function KpiCard({
  label,
  value,
  format = 'integer',
  icon,
  accent = 'primary',
  sub,
}: KpiCardProps) {
  const [display, setDisplay] = useState<number>(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const animated = useRef<boolean>(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || animated.current || value === null || value === undefined) return;

    if (!('IntersectionObserver' in window)) {
      setDisplay(value);
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        animated.current = true;
        const dur = 1200;
        const start = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - start) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          setDisplay(value * eased);
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        io.unobserve(el);
      });
    }, { threshold: 0.4 });

    io.observe(el);
    return () => io.disconnect();
  }, [value]);

  return (
    <div className={`kpi-card glass kpi-${accent}`} ref={ref}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-body">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{formatValue(display, format)}</div>
        {sub ? <div className="kpi-sub">{sub}</div> : null}
      </div>
    </div>
  );
}
