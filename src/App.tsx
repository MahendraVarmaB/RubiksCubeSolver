/**
 * App.tsx
 * Top-level application: manages the scan -> solve workflow.
 */

import { useState, useEffect, useCallback } from 'react';
import CameraScanner from './components/CameraScanner';
import ManualInput from './components/ManualInput';
import FacePreview from './components/FacePreview';
import SolutionPlayer from './components/SolutionPlayer';
import { useScanStore } from './stores/scan-store';
import { solverBridge } from './lib/solver-bridge';
import { FACE_NAMES } from './lib/color-detection';
import type { SolveResult } from './lib/solver/search';
import './App.css';

type AppPhase = 'loading' | 'input' | 'solving' | 'result';
type InputMode = 'camera' | 'manual';

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('loading');
  const [inputMode, setInputMode] = useState<InputMode>('manual');
  const [initProgress, setProgress] = useState(0);
  const [solveResult, setResult] = useState<SolveResult | null>(null);
  const [solveError, setError] = useState<string | null>(null);
  const [initialFacelets, setInitialFacelets] = useState<string | null>(null);

  const { faces, isComplete, getFaceletString, resetAll } = useScanStore();

  useEffect(() => {
    let cancelled = false;

    const unsub = solverBridge.onProgress(pct => {
      if (!cancelled) setProgress(pct);
    });

    solverBridge.init().then(() => {
      if (!cancelled) setPhase('input');
    }).catch(err => {
      if (!cancelled) setError(`Solver init failed: ${err.message}`);
    });

    return () => { cancelled = true; unsub(); };
  }, []);

  const handleCameraSolve = useCallback(async () => {
    const facelets = getFaceletString();
    if (!facelets) {
      setError('Invalid scan: two faces have the same center color. Please re-scan.');
      return;
    }

    setPhase('solving');
    setError(null);
    setInitialFacelets(facelets);

    try {
      const result = await solverBridge.solve(facelets);
      setResult(result);
      setPhase('result');
      if (result.errorCode !== 0) {
        setError(result.errorMessage);
      }
    } catch (err: any) {
      setError(err.message);
      setPhase('input');
    }
  }, [getFaceletString]);

  const handleManualSolveSuccess = useCallback((result: SolveResult, facelets: string) => {
    setInitialFacelets(facelets);
    setResult(result);
    setPhase('result');
  }, []);

  const handleReset = useCallback(() => {
    resetAll();
    setResult(null);
    setError(null);
    setInitialFacelets(null);
    setPhase('input');
  }, [resetAll]);

  const handleClearError = useCallback(() => setError(null), []);

  return (
    <div className="app">
      <header className="app__header" id="app-header">
        <h1>
          <span className="app__logo">Rubik's</span>
          Cube Solver
        </h1>
        <p className="text-secondary">Scan - Solve - Conquer</p>
      </header>

      {phase === 'loading' && (
        <div className="app__loading card animate-fade-in" id="solver-loading">
          <p>Initializing solver tables...</p>
          <div className="progress-bar">
            <div
              className="progress-bar__fill"
              style={{ width: `${initProgress}%` }}
            />
          </div>
          <p className="text-muted">{Math.round(initProgress)}%</p>
        </div>
      )}

      {phase === 'input' && (
        <main className="app__main animate-slide-up">
          <div className="mode-toggle">
            <button
              className={`toggle-btn ${inputMode === 'manual' ? 'active' : ''}`}
              onClick={() => setInputMode('manual')}
            >
              Manual Input
            </button>
            <button
              className={`toggle-btn ${inputMode === 'camera' ? 'active' : ''}`}
              onClick={() => setInputMode('camera')}
            >
              Camera Scan
            </button>
          </div>

          {inputMode === 'camera' ? (
            <>
              <CameraScanner />
              {isComplete && (
                <div className="app__solve-bar animate-slide-up" id="solve-bar">
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={handleCameraSolve}
                    id="solve-btn"
                  >
                    Solve Cube
                  </button>
                </div>
              )}
            </>
          ) : (
            <ManualInput
              onSolveStart={() => { setPhase('solving'); setError(null); }}
              onSolveSuccess={handleManualSolveSuccess}
              onSolveError={(err) => { setError(err); setPhase('input'); }}
              onClearError={handleClearError}
            />
          )}

          {solveError && (
            <div className="app__error animate-fade-in" id="solve-error">
              <p>{solveError}</p>
            </div>
          )}
        </main>
      )}

      {phase === 'solving' && (
        <div className="app__loading card animate-fade-in" id="solving-spinner">
          <div className="scanner__spinner" />
          <p>Solving...</p>
        </div>
      )}

      {phase === 'result' && solveResult && (
        <main className="app__result animate-slide-up" id="solve-result">
          {inputMode === 'camera' && (
            <div className="result__faces" id="result-faces">
              {FACE_NAMES.map(face => (
                <FacePreview
                  key={face}
                  face={face}
                  colors={faces[face]}
                  size="md"
                />
              ))}
            </div>
          )}

          {solveResult.errorCode === 0 ? (
            initialFacelets && (
              <SolutionPlayer
                initialFacelets={initialFacelets}
                moves={solveResult.moves}
                timeMs={solveResult.timeMs}
              />
            )
          ) : (
            <div className="app__error card" id="solve-error-result">
              <p>{solveResult.errorMessage}</p>
            </div>
          )}

          <button
            className="btn btn-secondary btn-lg"
            onClick={handleReset}
            id="scan-again-btn"
          >
            Try Again
          </button>
        </main>
      )}
    </div>
  );
}
