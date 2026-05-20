import { useState, useCallback } from 'react';
import PredictForm from '../components/PredictForm';
import ResultPanel from '../components/ResultPanel';
import BatchPredict from '../components/BatchPredict';
import { fetchPrediction } from '../api';
import useReveal from '../hooks/useReveal';
import type { PredictionPayload, PredictionResult, ResultState } from '../types';

type Mode = 'single' | 'batch';

export default function Predict() {
  const [mode,    setMode]    = useState<Mode>('single');

  // Re-run the reveal observer whenever the tab changes: switching tabs
  // unmounts/remounts PredictForm + ResultPanel (or BatchPredict), and the
  // freshly mounted `.reveal` elements need to be observed again so they
  // pick up the `is-visible` class instead of staying at opacity: 0.
  useReveal([mode]);

  const [state,   setState]   = useState<ResultState>('empty');
  const [result,  setResult]  = useState<PredictionResult | null>(null);
  const [record,  setRecord]  = useState<PredictionPayload | null>(null);
  const [error,   setError]   = useState<string>('');

  const runPrediction = useCallback(async (payload: PredictionPayload) => {
    setRecord(payload);
    setState('loading');
    setError('');

    if (window.innerWidth < 960) {
      setTimeout(() => {
        document.querySelector('.result-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }

    try {
      const out = await fetchPrediction(payload);
      setResult(out);
      setState('done');
    } catch (e) {
      console.error('[CardIAc]', e);
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
    }
  }, []);

  const handleReset = useCallback(() => {
    setState('empty');
    setResult(null);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleRetry = useCallback(() => {
    if (record) runPrediction(record);
  }, [record, runPrediction]);

  return (
    <main className="predict-page">
      <div className="container">
        <div className="section-head reveal" style={{ marginBottom: '24px' }}>
          <span className="eyebrow">Predicción en vivo</span>
          <h2>Evalúa tu riesgo cardiovascular</h2>
          <p className="lead">
            Predice un paciente desde el formulario o procesa cientos a la vez subiendo un CSV.
          </p>
        </div>

        {/* Tabs --------------------------------------------------------- */}
        <div className="predict-tabs reveal" role="tablist">
          <button
            role="tab"
            type="button"
            aria-selected={mode === 'single'}
            className={`predict-tab${mode === 'single' ? ' is-active' : ''}`}
            onClick={() => setMode('single')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            <span>Individual</span>
            <small>un paciente</small>
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={mode === 'batch'}
            className={`predict-tab${mode === 'batch' ? ' is-active' : ''}`}
            onClick={() => setMode('batch')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <path d="M7 10l5 5 5-5" />
              <path d="M12 15V3" />
            </svg>
            <span>Lote CSV</span>
            <small>varios pacientes</small>
          </button>
        </div>

        {/* Tab content -------------------------------------------------- */}
        {mode === 'single' ? (
          <div className="predict-layout">
            <PredictForm onSubmit={runPrediction} isLoading={state === 'loading'} />
            <ResultPanel
              state={state}
              result={result}
              error={error}
              record={record}
              onReset={handleReset}
              onRetry={handleRetry}
            />
          </div>
        ) : (
          <BatchPredict />
        )}
      </div>
    </main>
  );
}
