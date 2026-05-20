import { useEffect, useMemo, useState } from 'react';
import type { PredictionPayload, PredictionResult, ResultState } from '../types';
import { buildFactors, type Factor, type FactorKind } from '../lib/factors';

const CIRC = 2 * Math.PI * 80;

type RiskLevel = 'low' | 'mid' | 'high';

function classifyRisk(p: number): RiskLevel {
  if (p < 0.35) return 'low';
  if (p < 0.65) return 'mid';
  return 'high';
}

function FactorIcon({ kind }: { kind: FactorKind }) {
  if (kind === 'up') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17L17 7M17 7H8M17 7v9" />
    </svg>
  );
  if (kind === 'down') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 7L7 17M7 17h9M7 17V8" />
    </svg>
  );
  return <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4" /></svg>;
}

type AnalysisState = 'idle' | 'loading' | 'done' | 'hidden';

interface ResultPanelProps {
  state:         ResultState;
  result:        PredictionResult | null;
  error:         string;
  record:        PredictionPayload | null;
  analysis:      string;
  analysisModel: string;
  analysisState: AnalysisState;
  onReset:       () => void;
  onRetry:       () => void;
}

export default function ResultPanel({
  state, result, error, record, analysis, analysisModel, analysisState, onReset, onRetry,
}: ResultPanelProps) {
  const [displayPct, setDisplayPct] = useState<number>(0);

  useEffect(() => {
    if (state !== 'done' || !result) {
      setDisplayPct(0);
      return;
    }
    const target = result.probability * 100;
    const dur = 1100;
    const startTs = performance.now();
    let raf: number | undefined;
    const tick = (t: number) => {
      const p = Math.min(1, (t - startTs) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayPct(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { if (raf !== undefined) cancelAnimationFrame(raf); };
  }, [state, result]);

  const risk: RiskLevel = result ? classifyRisk(result.probability) : 'low';
  const offset           = result ? CIRC * (1 - result.probability) : CIRC;
  const factors          = useMemo<Factor[]>(
    () => (result && record) ? buildFactors(record) : [],
    [result, record],
  );

  // Verdict pill now reflects the model's binary prediction (not the probability
  // bucket). Matches the language used in the batch results table.
  const isPositive   = result?.prediction === 1;
  const verdictText  = isPositive ? 'Indicios'     : 'Sin indicios';
  const verdictClass = isPositive ? 'pred-pos'      : 'pred-neg';

  return (
    <aside className="result-panel glass reveal" data-state={state}>

      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="gradGreen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#B5E8D5" />
            <stop offset="100%" stopColor="#6FC598" />
          </linearGradient>
          <linearGradient id="gradAmber" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#FCEFD9" />
            <stop offset="100%" stopColor="#F4B58D" />
          </linearGradient>
          <linearGradient id="gradRed" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#F8C8C8" />
            <stop offset="100%" stopColor="#EE9695" />
          </linearGradient>
        </defs>
      </svg>

      <div className="result-empty">
        <div className="ghost-heart">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s-7-4.5-9.5-9C0.5 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4 4.5 8-2.5 4.5-9.5 9-9.5 9z" />
          </svg>
        </div>
        <h3>Esperando datos</h3>
        <p>Completa el formulario y obtendrás tu resultado aquí mismo.</p>
      </div>

      <div className="result-loading">
        <div className="spinner"></div>
        <p>Analizando con el modelo XGBoost…</p>
        <p className="loading-hint">Si es la primera predicción en un rato, el endpoint puede tardar ~30s en despertar.</p>
      </div>

      <div className="result-done">
        <div className="gauge" data-risk={risk}>
          <svg viewBox="0 0 200 200">
            <circle className="gauge-track" cx="100" cy="100" r="80" />
            <circle
              className="gauge-fill"
              cx="100" cy="100" r="80"
              style={{ strokeDasharray: CIRC, strokeDashoffset: offset }}
            />
          </svg>
          <div className="gauge-center">
            <div>
              <div className="gauge-pct">{displayPct.toFixed(1)}%</div>
              <div className="gauge-lbl">Probabilidad CVD</div>
            </div>
          </div>
        </div>

        <div className={`verdict ${verdictClass}`}>
          <span className="dot"></span>
          <span>{verdictText}</span>
        </div>

        <h3>
          {isPositive
            ? 'Indicios de enfermedad cardiovascular'
            : 'Sin indicios significativos'}
        </h3>
        {/* Static fallback summary — only shown when the GPT analysis is
            unavailable (backend missing OPENAI_API_KEY or upstream error).
            When the AI is active, its personalised analysis takes this role. */}
        {(analysisState === 'hidden' || analysisState === 'idle') && (
          <p className="summary">
            {isPositive
              ? 'El modelo clasifica este perfil como positivo. Recomendamos consultar un profesional de la salud para una evaluación.'
              : 'El modelo clasifica este perfil como negativo. Mantén tus hábitos saludables y revisiones periódicas.'}
          </p>
        )}

        {/* AI analysis card (silently hidden if backend disabled it) */}
        {analysisState !== 'hidden' && analysisState !== 'idle' && (
          <div className={`ai-analysis ${analysisState === 'loading' ? 'is-loading' : 'is-done'}`}>
            {/* Hanging heart mascot — swings gently from the top-right of the card
                like a tiny chimpanzee gripping the edge. Decorative only. */}
            <span className="ai-mascot" aria-hidden>
              <svg viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg">
                {/* Arms reaching up to "grip" the top edge */}
                <path d="M14 17 Q 11 9, 12 3" stroke="#C26764" strokeWidth="2.2" strokeLinecap="round" fill="none" />
                <path d="M26 17 Q 29 9, 28 3" stroke="#C26764" strokeWidth="2.2" strokeLinecap="round" fill="none" />
                {/* Hands gripping (little circles) */}
                <circle cx="12" cy="3"  r="2.6" fill="#C26764" />
                <circle cx="28" cy="3"  r="2.6" fill="#C26764" />
                {/* Heart-shaped body */}
                <path
                  d="M20 38 C 12 30, 8 22, 14 18 C 17 16, 19.5 18, 20 19.6 C 20.5 18, 23 16, 26 18 C 32 22, 28 30, 20 38 Z"
                  fill="#EE9695"
                  stroke="#C26764"
                  strokeWidth="1.3"
                />
                {/* Eyes: white sclera + dark pupils */}
                <ellipse cx="16.5" cy="22.6" rx="1.8" ry="2.1" fill="#fff" />
                <ellipse cx="23.5" cy="22.6" rx="1.8" ry="2.1" fill="#fff" />
                <circle  cx="16.8" cy="23.1" r="1"     fill="#3D2725" className="mascot-eye" />
                <circle  cx="23.8" cy="23.1" r="1"     fill="#3D2725" className="mascot-eye" />
                {/* Smile */}
                <path d="M17 27.5 Q 20 30, 23 27.5" stroke="#3D2725" strokeWidth="1.1" fill="none" strokeLinecap="round" />
                {/* Cheek blush */}
                <circle cx="13.8" cy="26" r="1.4" fill="rgba(238, 150, 149, 0.55)" />
                <circle cx="26.2" cy="26" r="1.4" fill="rgba(238, 150, 149, 0.55)" />
              </svg>
            </span>

            <div className="ai-analysis-head">
              <span className="ai-sparkle" aria-hidden>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l1.6 4.6L18 8.2l-4.4 1.6L12 14.4 10.4 9.8 6 8.2l4.4-1.6L12 2zM19 13l.8 2.3 2.2.8-2.2.8L19 19.2l-.8-2.3-2.2-.8 2.2-.8L19 13zM5 14l.6 1.8L7.4 16.4l-1.8.6L5 18.8l-.6-1.8L2.6 16.4l1.8-.6L5 14z" />
                </svg>
              </span>
              <span className="ai-eyebrow">
                Análisis con IA
                {analysisModel && (
                  <>
                    <span className="ai-eyebrow-sep" aria-hidden>·</span>
                    <span className="ai-model-name">{analysisModel}</span>
                  </>
                )}
              </span>
            </div>
            <div className="ai-analysis-body">
              {analysisState === 'loading' ? (
                <div className="ai-skeleton" aria-busy="true" aria-live="polite">
                  <span className="ai-line w-95" />
                  <span className="ai-line w-100" />
                  <span className="ai-line w-70" />
                </div>
              ) : (
                <p className="ai-text">{analysis}</p>
              )}
            </div>
            {analysisState === 'done' && (
              <p className="ai-disclaimer">
                Orientación informativa generada con IA · no sustituye un diagnóstico médico.
              </p>
            )}
          </div>
        )}

        <div className="factor-list">
          {factors.map((f, i) => (
            <div className={`factor ${f.k}`} key={i}>
              <span className="factor-icon"><FactorIcon kind={f.k} /></span>
              <span className="factor-text">{f.t}</span>
            </div>
          ))}
        </div>

        <div className="result-actions">
          <button className="btn btn-ghost" type="button" onClick={onReset}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 109-9" />
              <path d="M3 3v6h6" />
            </svg>
            Nueva predicción
          </button>
        </div>

        <p className="disclaimer">
          ⚕️ Este resultado es una estimación estadística con fines educativos. No reemplaza la evaluación de un profesional de la salud.
        </p>
      </div>

      <div className="result-error">
        <div className="ghost-heart" style={{ color: '#B0524F', borderColor: 'rgba(238,150,149,0.4)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <h3>No se pudo predecir</h3>
        <p>La petición al endpoint falló. Detalles abajo:</p>
        <div className="err-msg">{error}</div>
        <div className="result-actions">
          <button className="btn btn-ghost" type="button" onClick={onRetry}>Reintentar</button>
        </div>
      </div>
    </aside>
  );
}
