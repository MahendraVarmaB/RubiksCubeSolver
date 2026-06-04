/**
 * solver-bridge.ts
 * React-friendly wrapper around the solver Web Worker.
 * Exposes a clean Promise-based API and handles Worker lifecycle.
 */

import type { SolveResult } from './solver/search.js';
export type { SolveResult };

type WorkerMessage =
  | { type: 'progress'; payload: { pct: number } }
  | { type: 'ready' }
  | { type: 'result'; payload: SolveResult }
  | { type: 'error'; payload: { message: string } };

export type ProgressListener = (pct: number) => void;

const SOLVE_TIMEOUT_MS = 30_000; // 30 seconds max

class SolverBridge {
  private worker: Worker | null = null;
  private ready = false;
  private initListeners: Array<() => void> = [];
  private progressListeners: ProgressListener[] = [];

  /** Start the Worker and run table init. Call once on app boot. */
  async init(): Promise<void> {
    if (this.ready) return;
    if (this.worker) {
      // Already initialising — wait for it
      return new Promise(resolve => this.initListeners.push(resolve));
    }

    this.worker = new Worker(
      new URL('../workers/solver-worker.ts?v=3', import.meta.url),
      { type: 'module' },
    );

    return new Promise((resolve, reject) => {
      // Use addEventListener (not onmessage setter) so solve() handler coexists
      const initHandler = (e: MessageEvent<WorkerMessage>) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          this.progressListeners.forEach(fn => fn(msg.payload.pct));
        } else if (msg.type === 'ready') {
          this.worker!.removeEventListener('message', initHandler);
          this.ready = true;
          this.initListeners.forEach(fn => fn());
          this.initListeners = [];
          resolve();
        } else if (msg.type === 'error') {
          this.worker!.removeEventListener('message', initHandler);
          reject(new Error(msg.payload.message));
        }
      };

      this.worker!.addEventListener('message', initHandler);
      this.worker!.onerror = err => reject(err);
      this.worker!.postMessage({ type: 'init' });
    });
  }

  onProgress(fn: ProgressListener): () => void {
    this.progressListeners.push(fn);
    return () => {
      this.progressListeners = this.progressListeners.filter(f => f !== fn);
    };
  }

  /** Solve a 54-char facelet string. Rejects if solver not ready or times out. */
  solve(facelets: string, maxDepth = 21): Promise<SolveResult> {
    if (!this.ready || !this.worker) {
      return Promise.reject(new Error('Solver not ready — call init() first'));
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      // Safety timeout — prevents the spinner hanging forever
      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.worker?.removeEventListener('message', handler);
          reject(new Error('Solver timed out after 30 seconds. Try resetting and scanning again.'));
        }
      }, SOLVE_TIMEOUT_MS);

      const handler = (e: MessageEvent<WorkerMessage>) => {
        if (settled) return;
        const msg = e.data;
        if (msg.type === 'result') {
          settled = true;
          clearTimeout(timeoutId);
          this.worker!.removeEventListener('message', handler);
          resolve(msg.payload);
        } else if (msg.type === 'error') {
          settled = true;
          clearTimeout(timeoutId);
          this.worker!.removeEventListener('message', handler);
          reject(new Error(msg.payload.message));
        }
        // ignore progress during solve
      };

      this.worker!.addEventListener('message', handler);
      this.worker!.postMessage({ type: 'solve', payload: { facelets, maxDepth } });
    });
  }

  isReady(): boolean { return this.ready; }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready  = false;
  }
}

/** Singleton — import this anywhere in the app */
export const solverBridge = new SolverBridge();
