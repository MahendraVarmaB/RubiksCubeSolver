import { useMemo, useState, useRef } from 'react';
import { useManualStore } from '../stores/manual-store';
import { CubeColor, FACE_NAMES, type FaceName } from '../lib/color-detection';
import InteractiveCube from './InteractiveCube';
import { solverBridge } from '../lib/solver-bridge';
import type { SolveResult } from '../lib/solver/search';
import { verify } from '../lib/solver/search';
import './ManualInput.css';

interface ManualInputProps {
  onSolveStart: () => void;
  onSolveSuccess: (result: SolveResult, facelets: string) => void;
  onSolveError: (error: string) => void;
  onClearError: () => void;
}

// Darker, distinguishable palette — matches InteractiveCube
const PALETTE_COLORS = [
  { id: CubeColor.White,  css: '#d8d8d8', label: 'White'  },
  { id: CubeColor.Yellow, css: '#c8a000', label: 'Yellow' },
  { id: CubeColor.Green,  css: '#156b30', label: 'Green'  },
  { id: CubeColor.Blue,   css: '#0f4b8f', label: 'Blue'   },
  { id: CubeColor.Red,    css: '#b81c1c', label: 'Red'    },
  { id: CubeColor.Orange, css: '#c45200', label: 'Orange' },
];

export default function ManualInput({ onSolveStart, onSolveSuccess, onSolveError, onClearError }: ManualInputProps) {
  const { faces, activeColor, setActiveColor, setFaces, getValidationErrors, getFaceletString, resetToSolved } = useManualStore();

  // Color counts for the count summary
  const colorCounts = useMemo(() => {
    const counts: Record<string, number> = {
      [CubeColor.White]: 0, [CubeColor.Yellow]: 0, [CubeColor.Red]: 0,
      [CubeColor.Orange]: 0, [CubeColor.Green]: 0, [CubeColor.Blue]: 0,
    };
    for (const face of FACE_NAMES) {
      for (const color of faces[face]) {
        counts[color] = (counts[color] ?? 0) + 1;
      }
    }
    return counts;
  }, [faces]);

  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const validationErrors = useMemo(() => getValidationErrors(), [faces, getValidationErrors]);
  const isValid = validationErrors.length === 0;

  const handleReset = () => {
    onClearError();
    resetToSolved();
  };

  // Export: copy the 54-char facelet string to clipboard
  const handleExport = async () => {
    const fs = getFaceletString();
    if (!fs) { setCopyMsg('⚠️ Cube state invalid — cannot export'); return; }
    try {
      await navigator.clipboard.writeText(fs);
      setCopyMsg('✅ Copied to clipboard!');
    } catch {
      setCopyMsg(`State: ${fs}`);
    }
    setTimeout(() => setCopyMsg(null), 4000);
  };

  // Import: read a 54-char facelet string and apply it to the cube
  const handleImport = () => {
    const raw = importRef.current?.value.trim() ?? '';
    if (raw.length !== 54) {
      setImportError('Facelet string must be exactly 54 characters.');
      return;
    }
    const validChars = /^[URFDLBurfdlb]+$/;
    if (!validChars.test(raw)) {
      setImportError('Invalid characters. Use only U R F D L B.');
      return;
    }
    const faceStr = raw.toUpperCase();
    // Map face letter → color by looking at centers of the solved state
    const centerMap: Record<string, CubeColor> = {
      U: CubeColor.White,
      R: CubeColor.Red,
      F: CubeColor.Green,
      D: CubeColor.Yellow,
      L: CubeColor.Orange,
      B: CubeColor.Blue,
    };
    const newFaces: Record<FaceName, CubeColor[]> = { U: [], R: [], F: [], D: [], L: [], B: [] };
    const faceOrder: FaceName[] = ['U', 'R', 'F', 'D', 'L', 'B'];
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 9; i++) {
        const letter = faceStr[f * 9 + i];
        const color = centerMap[letter];
        if (!color) { setImportError(`Unknown face letter '${letter}'.`); return; }
        newFaces[faceOrder[f]].push(color);
      }
    }
    setFaces(newFaces);
    setImportError(null);
    if (importRef.current) importRef.current.value = '';
  };

  const handleSolve = async () => {
    if (!isValid) return;

    const facelets = getFaceletString();
    if (!facelets) {
      onSolveError('Invalid center configuration. Ensure each face has a unique center color.');
      return;
    }

    onSolveStart();

    try {
      const result = await solverBridge.solve(facelets, 25);
      if (result.errorCode === 0) {
        onSolveSuccess(result, facelets);
      } else {
        onSolveError(result.errorMessage);
      }
    } catch (err: any) {
      onSolveError(err.message);
    }
  };

  return (
    <div className="manual-input animate-slide-up">
      <div className="manual-header">
        <p className="text-secondary text-center">
          Select a color, then click any sticker to paint it. Drag to rotate.
        </p>
      </div>

      {/* Color palette */}
      <div className="color-palette card">
        <div className="palette-grid">
          {PALETTE_COLORS.map((col) => (
            <button
              key={col.id}
              className={`palette-btn ${activeColor === col.id ? 'active' : ''}`}
              style={{ backgroundColor: col.css }}
              onClick={() => setActiveColor(col.id)}
              title={col.label}
              aria-label={`Select ${col.label}`}
            />
          ))}
        </div>
      </div>

      <InteractiveCube onUserAction={onClearError} />

      {/* Color count summary */}
      <div className="color-counts card">
        {PALETTE_COLORS.map((col) => {
          const count = colorCounts[col.id] ?? 0;
          const ok = count === 9;
          return (
            <div key={col.id} className={`count-item ${ok ? 'count-item--ok' : 'count-item--bad'}`}>
              <span className="count-dot" style={{ backgroundColor: col.css }} />
              <span className="count-label">{col.label}</span>
              <span className="count-value">{count}/9</span>
            </div>
          );
        })}
      </div>

      <div className="manual-controls">
        <button className="btn btn-secondary" onClick={handleReset}>
          ↻ Reset
        </button>
        <button
          className="btn btn-primary btn-lg"
          onClick={handleSolve}
          disabled={!isValid}
        >
          🚀 Solve Cube
        </button>
      </div>

      {/* Export / Import state */}
      <div className="state-tools">
        <div className="state-tools__header">
          <p className="state-tools__title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            State Transfer
          </p>
          {copyMsg ? (
            <span className="state-tools__msg">{copyMsg}</span>
          ) : (
            <button className="btn btn-secondary btn-icon" onClick={handleExport}>
              Export to Clipboard
            </button>
          )}
        </div>
        <div className="state-tools__row">
          <input
            ref={importRef}
            className="state-tools__input"
            placeholder="Paste 54-char facelet string..."
            maxLength={54}
          />
          <button className="btn btn-primary btn-icon" onClick={handleImport}>
            Import
          </button>
        </div>
        {importError && <p className="text-danger text-sm" style={{ marginTop: '-4px' }}>{importError}</p>}
      </div>

      {!isValid && (
        <div className="manual-errors">
          {validationErrors.map((err, i) => (
            <p key={i} className="text-danger text-sm">⚠️ {err}</p>
          ))}
        </div>
      )}
    </div>
  );
}
