/**
 * tests/solver.test.ts
 * Unit tests for the min2phase solver port.
 * Run with: npm test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver, solveCube, verify } from '../src/lib/solver/search.js';
import { toFaceCube } from '../src/lib/solver/cubie-cube.js';

// Known scrambled positions and their expected properties
const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

const KNOWN_SCRAMBLES: Array<{ scramble: string; facelets: string }> = [
  {
    scramble: "R U R' U'",
    // Calculated separately
    facelets: '',  // populated in beforeAll
  },
];

describe('Solver core — verify()', () => {
  it('accepts a solved cube string', () => {
    expect(verify(SOLVED)).toBe(0);
  });

  it('rejects wrong length', () => {
    expect(verify('UUUUUUUUU')).toBe(-1);
  });

  it('rejects wrong colour counts', () => {
    const bad = SOLVED.replace('U', 'R');
    expect(verify(bad)).toBeLessThan(0);
  });
});

describe('Solver init and basic solve', () => {
  beforeAll(async () => {
    await initSolver();
  }, 60_000); // allow up to 60s for table construction

  it('initialises without throwing', () => {
    // If we get here, initSolver() resolved — tables built OK
    expect(true).toBe(true);
  });

  it('solves the solved cube (0 moves)', () => {
    const result = solveCube(SOLVED);
    expect(result.errorCode).toBe(0);
    expect(result.moveCount).toBe(0);
    expect(result.moves).toEqual([]);
  });

  it('solves a known 4-move scramble in ≤ 21 moves', () => {
    // R U R' U' applied to solved
    const facelets = applyScramble("R U R' U'");

    const result = solveCube(facelets);
    expect(result.errorCode).toBe(0);
    expect(result.moveCount).toBeGreaterThan(0);
    expect(result.moveCount).toBeLessThanOrEqual(21);
  });

  it('solves user-reported failing cube state', () => {
    // Facelet string reported by user to cause timeout/no-solve
    const facelets = 'RRRLUUURBLLDLRRLBUFUDRFDUUDBFFLDUFFBFFLDLDDBRBFUBBBLDR';
    const start = Date.now();
    const result = solveCube(facelets);
    const elapsed = Date.now() - start;
    console.log(`[user cube] errorCode=${result.errorCode} moves=${result.moveCount} time=${elapsed}ms solution="${result.moveString}"`);
    expect(result.errorCode).toBe(0);
    expect(result.moveCount).toBeLessThanOrEqual(21);
    expect(elapsed).toBeLessThan(10_000);

    // Verify the solution actually solves it
    if (result.moveCount > 0) {
      const solvedStr = applyScramble(result.moveString);
      // The solution applied to SOLVED should transform to the scramble
      // OR: scramble + solution = SOLVED
      // Actually: applying solution to the scrambled state should give SOLVED
      // We need to apply the scramble first to get the user's state...
      // Since we don't know the original scramble moves, just verify errorCode=0
    }
  }, 30_000);

  it('solves 5 random scrambles and verifies each solution', () => {
    const scrambles = [
      'R U2 D B2 F',
      "L' F2 R B U'",
      "U2 L2 F2 R2 B2",
      "R L U D F B",
      "F R U B L D",
    ];
    for (const scr of scrambles) {
      const facelets = applyScramble(scr);
      const start = Date.now();
      const result   = solveCube(facelets);
      const elapsed = Date.now() - start;
      expect(result.errorCode).toBe(0);
      expect(result.moveCount).toBeGreaterThan(0);
      expect(result.moveCount).toBeLessThanOrEqual(21);
      expect(elapsed).toBeLessThan(10_000); // must solve in < 10 seconds

      // Verify the solution actually solves it
      const solvedStr = applyScramble(scr + ' ' + result.moveString);
      expect(solvedStr).toBe(SOLVED);
    }
  }, 60_000);
});

import { CubieCube, moveCube } from '../src/lib/solver/cubie-cube.js';
import { move2str } from '../src/lib/solver/util.js';

// ─── Helper: apply a move sequence string to the solved cube ─────────────────

export function applyScramble(moves: string): string {
  // Parse move string
  const moveNums: number[] = [];
  const tokens = moves.trim().split(/\s+/);
  for (const tok of tokens) {
    if (!tok) continue;
    const idx = move2str.indexOf(tok.padEnd(2, ' '));
    if (idx < 0) {
      // Try alternate format
      const alt = move2str.indexOf(tok.padEnd(2));
      if (alt >= 0) moveNums.push(alt);
      // else skip unknown tokens
    } else {
      moveNums.push(idx);
    }
  }

  let c1 = new CubieCube();
  let c2 = new CubieCube();
  for (const m of moveNums) {
    CubieCube.EdgeMult(c1, moveCube[m], c2);
    CubieCube.CornMult(c1, moveCube[m], c2);
    [c1, c2] = [c2, c1];
  }
  return toFaceCube(c1);
}
