import { create } from 'zustand';
import { CubeColor, FaceName, FACE_NAMES, buildFaceletString } from '../lib/color-detection';

// Standard solved state colors
const SOLVED_STATE: Record<FaceName, CubeColor[]> = {
  U: Array(9).fill(CubeColor.White),
  R: Array(9).fill(CubeColor.Red),
  F: Array(9).fill(CubeColor.Green),
  D: Array(9).fill(CubeColor.Yellow),
  L: Array(9).fill(CubeColor.Orange),
  B: Array(9).fill(CubeColor.Blue),
};

export interface ManualState {
  /** 9 colors per face */
  faces: Record<FaceName, CubeColor[]>;

  /** Currently selected color to paint with */
  activeColor: CubeColor;

  /** Set the active color */
  setActiveColor: (color: CubeColor) => void;

  /** Paint a specific facelet */
  paintFacelet: (face: FaceName, index: number) => void;

  /** Reset to solved state */
  resetToSolved: () => void;

  /** Set all faces at once (used for import) */
  setFaces: (faces: Record<FaceName, CubeColor[]>) => void;

  /** Validate and return errors if any */
  getValidationErrors: () => string[];

  /** Build the 54-char URFDLB facelet string */
  getFaceletString: () => string | null;
}

export const useManualStore = create<ManualState>((set, get) => ({
  // Deep copy solved state
  faces: JSON.parse(JSON.stringify(SOLVED_STATE)),
  activeColor: CubeColor.White,

  setActiveColor: (color) => set({ activeColor: color }),

  setFaces: (faces) => set({ faces: JSON.parse(JSON.stringify(faces)) }),

  paintFacelet: (face, index) => {
    const { faces, activeColor } = get();
    const newFaceColors = [...faces[face]];
    newFaceColors[index] = activeColor;
    set({ faces: { ...faces, [face]: newFaceColors } });
  },

  resetToSolved: () => set({ faces: JSON.parse(JSON.stringify(SOLVED_STATE)) }),

  getValidationErrors: () => {
    const { faces } = get();
    
    // Check color counts
    const counts: Record<string, number> = {
      [CubeColor.White]: 0,
      [CubeColor.Yellow]: 0,
      [CubeColor.Red]: 0,
      [CubeColor.Orange]: 0,
      [CubeColor.Green]: 0,
      [CubeColor.Blue]: 0,
    };

    let total = 0;
    for (const face of FACE_NAMES) {
      for (const color of faces[face]) {
        counts[color]++;
        total++;
      }
    }

    const errors: string[] = [];
    for (const [color, count] of Object.entries(counts)) {
      if (count < 9) {
        errors.push(`Missing ${9 - count} ${color}`);
      } else if (count > 9) {
        errors.push(`Extra ${count - 9} ${color}`);
      }
    }

    // Check center colors are unique
    const centers = new Set<string>();
    for (const face of FACE_NAMES) {
      const center = faces[face][4];
      if (centers.has(center)) {
        errors.push(`Duplicate center color: ${center}`);
      }
      centers.add(center);
    }

    return errors;
  },

  getFaceletString: () => {
    const { faces } = get();
    return buildFaceletString(faces);
  },
}));
