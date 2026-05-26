import type { ModelInfoResponse } from '../../types';

const ICON_MODEL = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6"  cy="6"  r="2.2" />
    <circle cx="18" cy="6"  r="2.2" />
    <circle cx="6"  cy="18" r="2.2" />
    <circle cx="18" cy="18" r="2.2" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M8 6h8M8 18h8M6 8v8M18 8v8M7.6 7.6l2.8 2.8M16.4 7.6l-2.8 2.8M7.6 16.4l2.8-2.8M16.4 16.4l-2.8-2.8" />
  </svg>
);

const ICON_THRESHOLD = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 17l5-5 4 4 7-9" />
    <path d="M14 7h6v6" />
  </svg>
);

const ICON_CALENDAR = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 11h18" />
  </svg>
);

function formatChampionSince(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface ModelCardBannerProps {
  info: ModelInfoResponse;
}

export default function ModelCardBanner({ info }: ModelCardBannerProps) {
  const championSince = formatChampionSince(info.champion_since);
  const algorithm     = info.algorithm || 'unknown';
  const threshold     = info.optimal_threshold;

  return (
    <div className="model-card glass reveal">
      <div className="model-card-mark">
        {ICON_MODEL}
      </div>

      <div className="model-card-body">
        <div className="model-card-eyebrow">Modelo en producción</div>
        <div className="model-card-title">
          <code className="model-card-name">{info.model_name}</code>
          <span className="model-card-version">v{info.version}</span>
        </div>
        <div className="model-card-tags">
          <span className="model-tag model-tag-algo">{algorithm}</span>
          {info.pipeline_version ? (
            <span className="model-tag">pipeline {info.pipeline_version}</span>
          ) : null}
          <span className="model-tag model-tag-alias">
            <span className="model-tag-dot" />
            @champion
          </span>
        </div>
      </div>

      <div className="model-card-meta">
        {threshold !== null ? (
          <div className="model-meta-chip">
            <span className="model-meta-icon">{ICON_THRESHOLD}</span>
            <div>
              <div className="model-meta-lbl">Umbral óptimo</div>
              <div className="model-meta-val">{threshold.toFixed(2)}</div>
            </div>
          </div>
        ) : null}
        {championSince ? (
          <div className="model-meta-chip">
            <span className="model-meta-icon">{ICON_CALENDAR}</span>
            <div>
              <div className="model-meta-lbl">Champion desde</div>
              <div className="model-meta-val">{championSince}</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
