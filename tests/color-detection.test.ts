/**
 * tests/color-detection.test.ts
 * Unit tests for color detection logic.
 */

import { describe, it, expect } from 'vitest';
import {
  rgbToHsl,
  classifyColor,
  CubeColor,
  buildFaceletString,
  type FaceName,
} from '../src/lib/color-detection';

// ── rgbToHsl tests ───────────────────────────────────────────────────────────

describe('rgbToHsl()', () => {
  it('converts pure red', () => {
    const [h, s, l] = rgbToHsl(255, 0, 0);
    expect(h).toBeCloseTo(0, 0);
    expect(s).toBeCloseTo(100, 0);
    expect(l).toBeCloseTo(50, 0);
  });

  it('converts pure green', () => {
    const [h, s, l] = rgbToHsl(0, 255, 0);
    expect(h).toBeCloseTo(120, 0);
    expect(s).toBeCloseTo(100, 0);
    expect(l).toBeCloseTo(50, 0);
  });

  it('converts pure blue', () => {
    const [h, s, l] = rgbToHsl(0, 0, 255);
    expect(h).toBeCloseTo(240, 0);
    expect(s).toBeCloseTo(100, 0);
    expect(l).toBeCloseTo(50, 0);
  });

  it('converts white', () => {
    const [h, s, l] = rgbToHsl(255, 255, 255);
    expect(s).toBeCloseTo(0, 0);
    expect(l).toBeCloseTo(100, 0);
  });

  it('converts black', () => {
    const [h, s, l] = rgbToHsl(0, 0, 0);
    expect(s).toBeCloseTo(0, 0);
    expect(l).toBeCloseTo(0, 0);
  });

  it('converts a typical orange', () => {
    const [h, s, l] = rgbToHsl(243, 156, 18); // #f39c12
    expect(h).toBeGreaterThanOrEqual(30);
    expect(h).toBeLessThanOrEqual(40);
    expect(s).toBeGreaterThan(80);
  });
});

// ── classifyColor tests ──────────────────────────────────────────────────────

describe('classifyColor()', () => {
  it('classifies pure white', () => {
    expect(classifyColor(255, 255, 255)).toBe(CubeColor.White);
  });

  it('classifies off-white', () => {
    expect(classifyColor(240, 235, 230)).toBe(CubeColor.White);
  });

  it('classifies bright red', () => {
    expect(classifyColor(231, 76, 60)).toBe(CubeColor.Red);
  });

  it('classifies pure red', () => {
    expect(classifyColor(255, 0, 0)).toBe(CubeColor.Red);
  });

  it('classifies orange (#f39c12)', () => {
    expect(classifyColor(243, 156, 18)).toBe(CubeColor.Orange);
  });

  it('classifies typical cube orange', () => {
    expect(classifyColor(255, 165, 0)).toBe(CubeColor.Orange);
  });

  it('classifies yellow (#ffd93d)', () => {
    expect(classifyColor(255, 217, 61)).toBe(CubeColor.Yellow);
  });

  it('classifies pure yellow', () => {
    expect(classifyColor(255, 255, 0)).toBe(CubeColor.Yellow);
  });

  it('classifies green (#27ae60)', () => {
    expect(classifyColor(39, 174, 96)).toBe(CubeColor.Green);
  });

  it('classifies pure green', () => {
    expect(classifyColor(0, 255, 0)).toBe(CubeColor.Green);
  });

  it('classifies blue (#2980b9)', () => {
    expect(classifyColor(41, 128, 185)).toBe(CubeColor.Blue);
  });

  it('classifies pure blue', () => {
    expect(classifyColor(0, 0, 255)).toBe(CubeColor.Blue);
  });
});

// ── buildFaceletString tests ─────────────────────────────────────────────────

describe('buildFaceletString()', () => {
  it('builds correct string with standard color scheme', () => {
    // Standard: U=White, R=Red, F=Green, D=Yellow, L=Orange, B=Blue
    const faces: Record<FaceName, CubeColor[]> = {
      U: Array(9).fill(CubeColor.White),
      R: Array(9).fill(CubeColor.Red),
      F: Array(9).fill(CubeColor.Green),
      D: Array(9).fill(CubeColor.Yellow),
      L: Array(9).fill(CubeColor.Orange),
      B: Array(9).fill(CubeColor.Blue),
    };

    const result = buildFaceletString(faces);
    expect(result).toBe('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
  });

  it('handles non-standard center colors correctly', () => {
    // Suppose U=Red, R=Blue, F=White, D=Orange, L=Yellow, B=Green
    const faces: Record<FaceName, CubeColor[]> = {
      U: Array(9).fill(CubeColor.Red),    // center = Red → U
      R: Array(9).fill(CubeColor.Blue),   // center = Blue → R
      F: Array(9).fill(CubeColor.White),  // center = White → F
      D: Array(9).fill(CubeColor.Orange), // center = Orange → D
      L: Array(9).fill(CubeColor.Yellow), // center = Yellow → L
      B: Array(9).fill(CubeColor.Green),  // center = Green → B
    };

    const result = buildFaceletString(faces);
    expect(result).toBe('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
  });

  it('returns null if two faces have the same center color', () => {
    const faces: Record<FaceName, CubeColor[]> = {
      U: Array(9).fill(CubeColor.White),
      R: Array(9).fill(CubeColor.White), // duplicate center
      F: Array(9).fill(CubeColor.Green),
      D: Array(9).fill(CubeColor.Yellow),
      L: Array(9).fill(CubeColor.Orange),
      B: Array(9).fill(CubeColor.Blue),
    };

    expect(buildFaceletString(faces)).toBeNull();
  });

  it('maps mixed-color faces correctly', () => {
    // U face with some non-white stickers
    const faces: Record<FaceName, CubeColor[]> = {
      U: [CubeColor.Red, CubeColor.Green, CubeColor.Blue,
          CubeColor.Orange, CubeColor.White, CubeColor.Yellow,  // center=White → U
          CubeColor.Red, CubeColor.Blue, CubeColor.Green],
      R: Array(9).fill(CubeColor.Red),
      F: Array(9).fill(CubeColor.Green),
      D: Array(9).fill(CubeColor.Yellow),
      L: Array(9).fill(CubeColor.Orange),
      B: Array(9).fill(CubeColor.Blue),
    };

    const result = buildFaceletString(faces);
    // White→U, Red→R, Green→F, Yellow→D, Orange→L, Blue→B
    expect(result).not.toBeNull();
    expect(result!.substring(0, 9)).toBe('RFBLUDRBF');
    expect(result!.length).toBe(54);
  });
});
