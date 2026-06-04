/**
 * solver-worker.ts
 * Web Worker entry point for the min2phase solver.
 *
 * Messages received:
 *   { type: 'init' }
 *   { type: 'solve', payload: { facelets: string, maxDepth?: number } }
 *
 * Messages sent:
 *   { type: 'progress', payload: { pct: number } }
 *   { type: 'ready' }
 *   { type: 'result', payload: SolveResult }
 *   { type: 'error', payload: { message: string } }
 */

import { initSolver, solveCube, isInited } from '../lib/solver/search.js';
import type { SolveResult } from '../lib/solver/search.js';

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  try {
    if (type === 'init') {
      await initSolver((pct: number) => {
        self.postMessage({ type: 'progress', payload: { pct } });
      });
      self.postMessage({ type: 'ready' });
      return;
    }

    if (type === 'solve') {
      if (!isInited()) {
        self.postMessage({
          type: 'error',
          payload: { message: 'Solver not initialized. Send { type: "init" } first.' },
        });
        return;
      }
      const result: SolveResult = solveCube(
        payload.facelets,
        payload.maxDepth ?? 21,
      );
      self.postMessage({ type: 'result', payload: result });
      return;
    }

    self.postMessage({ type: 'error', payload: { message: `Unknown message type: ${type}` } });
  } catch (err: any) {
    self.postMessage({ type: 'error', payload: { message: String(err?.message ?? err) } });
  }
};
