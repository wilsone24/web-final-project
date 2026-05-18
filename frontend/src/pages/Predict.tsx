import { useState, useCallback } from 'react';
import PredictForm from '../components/PredictForm';
import ResultPanel from '../components/ResultPanel';
import { fetchPrediction } from '../api';
import useReveal from '../hooks/useReveal';
import type { PredictionPayload, PredictionResult, ResultState } from '../types';

export default function Predict() {
  useReveal([]);

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
      console.error('[CardioPredict]', e);
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
        <div className="section-head reveal" style={{ marginBottom: '48px' }}>
          <span className="eyebrow">Predicción en vivo</span>
          <h2>Evalúa tu riesgo cardiovascular</h2>
          <p className="lead">
            Completa los campos con la información clínica disponible. Algunos valores se calcularán automáticamente.
          </p>
        </div>

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
      </div>
    </main>
  );
}
