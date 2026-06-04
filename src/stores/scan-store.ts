/**
 * scan-store.ts
 * Zustand store managing the 6-face scanning workflow.
 */

import { create } from 'zustand';
import {
  CubeColor,
  FaceName,
  FACE_NAMES,
  buildFaceletString,
} from '../lib/color-detection';

export interface ScanState {
  /** 9 colors per face, or null if not yet scanned */
  faces: Record<FaceName, CubeColor[] | null>;

  /** Which face to scan next */
  currentFace: FaceName;

  /** Index into FACE_NAMES for the current face */
  currentFaceIndex: number;

  /** True when all 6 faces have been captured */
  isComplete: boolean;

  /** Store 9 colors for the current face, advance to next */
  captureFace: (colors: CubeColor[]) => void;

  /** Re-scan a specific face */
  resetFace: (face: FaceName) => void;

  /** Start over from scratch */
  resetAll: () => void;

  /** Build the 54-char URFDLB facelet string (dynamic center mapping) */
  getFaceletString: () => string | null;
}

const initialFaces = (): Record<FaceName, CubeColor[] | null> => ({
  U: null, R: null, F: null, D: null, L: null, B: null,
});

export const useScanStore = create<ScanState>((set, get) => ({
  faces: initialFaces(),
  currentFace: 'U',
  currentFaceIndex: 0,
  isComplete: false,

  captureFace: (colors: CubeColor[]) => {
    const state = get();
    const newFaces = { ...state.faces, [state.currentFace]: colors };
    const nextIndex = state.currentFaceIndex + 1;
    const complete = nextIndex >= FACE_NAMES.length;

    set({
      faces: newFaces,
      currentFace: complete ? state.currentFace : FACE_NAMES[nextIndex],
      currentFaceIndex: complete ? state.currentFaceIndex : nextIndex,
      isComplete: complete,
    });
  },

  resetFace: (face: FaceName) => {
    const state = get();
    const idx = FACE_NAMES.indexOf(face);
    set({
      faces: { ...state.faces, [face]: null },
      currentFace: face,
      currentFaceIndex: idx,
      isComplete: false,
    });
  },

  resetAll: () => {
    set({
      faces: initialFaces(),
      currentFace: 'U',
      currentFaceIndex: 0,
      isComplete: false,
    });
  },

  getFaceletString: () => {
    const state = get();
    // Check all faces are captured
    for (const face of FACE_NAMES) {
      if (!state.faces[face]) return null;
    }
    return buildFaceletString(
      state.faces as Record<FaceName, CubeColor[]>,
    );
  },
}));
