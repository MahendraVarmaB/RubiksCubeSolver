/**
 * color-detection.ts
 * Pure-logic module for detecting Rubik's Cube face colors from webcam frames.
 * No React dependencies — fully unit-testable.
 */

// ── Cube color enum ──────────────────────────────────────────────────────────

export enum CubeColor {
  White  = 'white',
  Yellow = 'yellow',
  Red    = 'red',
  Orange = 'orange',
  Green  = 'green',
  Blue   = 'blue',
}

/** CSS-friendly hex for rendering each cube color in the UI */
export const CUBE_COLOR_HEX: Record<CubeColor, string> = {
  [CubeColor.White]:  '#d8d8d8',
  [CubeColor.Yellow]: '#c8a000',
  [CubeColor.Red]:    '#b81c1c',
  [CubeColor.Orange]: '#c45200',
  [CubeColor.Green]:  '#156b30',
  [CubeColor.Blue]:   '#0f4b8f',
};

// ── RGB → HSL conversion ─────────────────────────────────────────────────────

/**
 * Convert RGB (0-255 each) to HSL.
 * Returns [h, s, l] where h ∈ [0,360), s ∈ [0,100], l ∈ [0,100].
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d   = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    if (max === rn) {
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    } else if (max === gn) {
      h = ((bn - rn) / d + 2) * 60;
    } else {
      h = ((rn - gn) / d + 4) * 60;
    }
  }

  return [
    Math.round(h * 10) / 10,         // hue: 0-360, 1 decimal
    Math.round(s * 1000) / 10,        // saturation: 0-100, 1 decimal
    Math.round(l * 1000) / 10,        // lightness: 0-100, 1 decimal
  ];
}

// ── Color classification ─────────────────────────────────────────────────────

/**
 * Classify an RGB pixel into one of the 6 Rubik's Cube colors.
 *
 * Strategy:
 *   1. Check White first (low saturation + high lightness)
 *   2. Check Yellow (medium-high lightness helps distinguish from orange)
 *   3. Then match by hue ranges for Red, Orange, Green, Blue
 *
 * These thresholds are tuned for typical indoor webcam lighting.
 */
export function classifyColor(r: number, g: number, b: number): CubeColor {
  const [h, s, l] = rgbToHsl(r, g, b);

  // ── White: low saturation, high lightness ──
  if (s < 20 && l > 60) return CubeColor.White;

  // ── Very bright + low saturation → White ──
  if (s < 30 && l > 75) return CubeColor.White;

  // ── Yellow: hue 45-70, decent saturation, bright ──
  if (h >= 45 && h < 70 && s > 35 && l > 35) return CubeColor.Yellow;

  // ── Orange: hue 15-45, saturated ──
  if (h >= 15 && h < 45 && s > 35 && l > 25) return CubeColor.Orange;

  // ── Red: hue 0-15 or 345-360, saturated ──
  if ((h < 15 || h >= 345) && s > 25 && l > 15 && l < 85) return CubeColor.Red;

  // ── Green: hue 70-170 ──
  if (h >= 70 && h < 170 && s > 20 && l > 12) return CubeColor.Green;

  // ── Blue: hue 170-260 ──
  if (h >= 170 && h < 260 && s > 20 && l > 12) return CubeColor.Blue;

  // ── Fallback: use nearest hue with relaxed thresholds ──
  if (l > 70 && s < 35) return CubeColor.White;
  if (h >= 45 && h < 70)  return CubeColor.Yellow;
  if (h >= 15 && h < 45)  return CubeColor.Orange;
  if (h < 15 || h >= 345) return CubeColor.Red;
  if (h >= 70 && h < 170) return CubeColor.Green;
  return CubeColor.Blue;
}

// ── Face extraction from canvas ──────────────────────────────────────────────

export interface GridRect {
  x: number;      // left edge in canvas pixels
  y: number;      // top edge in canvas pixels
  width: number;  // grid width
  height: number; // grid height
}

/**
 * Sample 9 color values from a canvas image, arranged as a 3×3 grid
 * within the given `gridRect`. Samples from the center of each cell.
 *
 * Returns a flat array of 9 CubeColors in row-major order:
 *   [0] [1] [2]
 *   [3] [4] [5]   ← index 4 is the center sticker
 *   [6] [7] [8]
 */
export function extractFaceColors(
  ctx: CanvasRenderingContext2D,
  gridRect: GridRect,
): CubeColor[] {
  const cellW = gridRect.width / 3;
  const cellH = gridRect.height / 3;
  const colors: CubeColor[] = [];

  // Sample a small region (5×5 pixels) around each cell center and average
  const sampleRadius = 2; // ±2 pixels → 5×5 block

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = Math.round(gridRect.x + cellW * (col + 0.5));
      const cy = Math.round(gridRect.y + cellH * (row + 0.5));

      // Get a small block of pixels for averaging
      const sx = Math.max(0, cx - sampleRadius);
      const sy = Math.max(0, cy - sampleRadius);
      const sw = sampleRadius * 2 + 1;
      const sh = sampleRadius * 2 + 1;

      const imageData = ctx.getImageData(sx, sy, sw, sh);
      const data = imageData.data;

      let rSum = 0, gSum = 0, bSum = 0;
      const pixelCount = sw * sh;
      for (let i = 0; i < data.length; i += 4) {
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
      }

      colors.push(classifyColor(
        Math.round(rSum / pixelCount),
        Math.round(gSum / pixelCount),
        Math.round(bSum / pixelCount),
      ));
    }
  }

  return colors;
}

// ── Face name constants ──────────────────────────────────────────────────────

export type FaceName = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export const FACE_NAMES: FaceName[] = ['U', 'R', 'F', 'D', 'L', 'B'];

/** Human-readable label for each face */
export const FACE_LABELS: Record<FaceName, string> = {
  U: 'Top (U)',
  R: 'Right (R)',
  F: 'Front (F)',
  D: 'Bottom (D)',
  L: 'Left (L)',
  B: 'Back (B)',
};

// ── Dynamic center-sticker mapping ───────────────────────────────────────────

/**
 * Build the 54-character facelet string from 6 scanned faces.
 *
 * The solver expects the string in URFDLB order, where each character
 * is one of {U,R,F,D,L,B} representing which face that sticker belongs to.
 *
 * We determine the mapping dynamically: the center sticker (index 4) of
 * each scanned face defines what color corresponds to what face letter.
 * For example, if the 'U' face has a red center, then all red stickers
 * on any face will be mapped to 'U'.
 *
 * @param faces Object mapping each FaceName to its 9 CubeColors
 * @returns 54-character string, or null if mapping is invalid
 */
export function buildFaceletString(
  faces: Record<FaceName, CubeColor[]>,
): string | null {
  // Step 1: Extract center color of each face
  const colorToFace = new Map<CubeColor, FaceName>();
  for (const face of FACE_NAMES) {
    const centerColor = faces[face][4]; // index 4 = center sticker
    if (colorToFace.has(centerColor)) {
      // Two faces have the same center color → invalid scan
      return null;
    }
    colorToFace.set(centerColor, face);
  }

  // Step 2: Verify all 6 colors are represented
  if (colorToFace.size !== 6) return null;

  // Step 3: Map every sticker to its face letter
  let faceletStr = '';
  for (const face of FACE_NAMES) {
    for (const color of faces[face]) {
      const letter = colorToFace.get(color);
      if (!letter) return null; // unknown color encountered
      faceletStr += letter;
    }
  }

  return faceletStr;
}
