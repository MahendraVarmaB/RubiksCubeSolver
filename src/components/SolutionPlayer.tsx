import { useMemo, useState, useEffect } from 'react';
import { FACE_NAMES, type FaceName } from '../lib/color-detection';
import { CubieCube, moveCube, toCubieCube, toFaceCube } from '../lib/solver/cubie-cube';
import { move2str } from '../lib/solver/util';
import './SolutionPlayer.css';

interface SolutionPlayerProps {
  initialFacelets: string;
  moves: string[];
  timeMs: number;
}

const FACE_COLORS: Record<string, string> = {
  U: '#d8d8d8',
  R: '#b81c1c',
  F: '#156b30',
  D: '#c8a000',
  L: '#c45200',
  B: '#0f4b8f',
};

const FACE_VIEW: Record<string, { x: number; y: number }> = {
  U: { x: -62, y: -38 },
  R: { x: -18, y: -58 },
  F: { x: -24, y: -34 },
  D: { x: 48, y: -38 },
  L: { x: -18, y: 42 },
  B: { x: -22, y: 138 },
};

function moveToIndex(move: string): number {
  const trimmed = move.trim();
  return move2str.findIndex((candidate) => candidate.trim() === trimmed);
}

function applyMove(facelets: string, move: string): string {
  const moveIndex = moveToIndex(move);
  if (moveIndex < 0) return facelets;

  const f = new Uint8Array(54);
  const chars = 'URFDLB';
  for (let i = 0; i < facelets.length; i++) {
    f[i] = chars.indexOf(facelets[i]);
  }

  const current = new CubieCube();
  const next = new CubieCube();
  toCubieCube(f, current);
  CubieCube.EdgeMult(current, moveCube[moveIndex], next);
  CubieCube.CornMult(current, moveCube[moveIndex], next);
  return toFaceCube(next);
}

function buildFaceMap(facelets: string): Record<FaceName, string[]> {
  const faces = {} as Record<FaceName, string[]>;
  FACE_NAMES.forEach((face, index) => {
    faces[face] = facelets.slice(index * 9, index * 9 + 9).split('');
  });
  return faces;
}

export default function SolutionPlayer({ initialFacelets, moves, timeMs }: SolutionPlayerProps) {
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setStep((prev) => {
        if (prev + 1 >= moves.length) {
          setIsPlaying(false);
          return prev + 1;
        }
        return prev + 1;
      });
    }, 1500);
    return () => clearInterval(timer);
  }, [isPlaying, moves.length]);

  const togglePlay = () => setIsPlaying((p) => !p);

  const states = useMemo(() => {
    const nextStates = [initialFacelets];
    for (const move of moves) {
      nextStates.push(applyMove(nextStates[nextStates.length - 1], move));
    }
    return nextStates;
  }, [initialFacelets, moves]);

  const currentMove = moves[step] ?? null;
  const isDone = moves.length > 0 && step >= moves.length;
  const activeFace = currentMove?.[0] ?? null;
  const faceMap = buildFaceMap(states[step] ?? initialFacelets);
  const view = FACE_VIEW.F;

  const getMoveArrow = (move: string) => {
    if (!move) return null;
    const isPrime = move.includes("'");
    const isDouble = move.includes("2");

    const getTextTransform = () => {
      if (activeFace === 'L' || activeFace === 'B') {
        return "translate(12, 12) scale(-1, 1) translate(-12, -12)";
      }
      if (activeFace === 'D') {
        return "translate(12, 12) scale(1, -1) translate(-12, -12)";
      }
      return "";
    };

    if (isPrime) {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="move-arrow move-arrow--ccw">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      );
    }
    
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="move-arrow move-arrow--cw">
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        {isDouble && (
          <text x="12" y="16" fontSize="8" fill="white" stroke="none" textAnchor="middle" fontWeight="bold" transform={getTextTransform()}>2</text>
        )}
      </svg>
    );
  };

  const renderFace = (face: FaceName) => {
    const isActive = activeFace === face;
    const isHiddenActive = ['B', 'L', 'D'].includes(activeFace || '');
    const shouldFade = isHiddenActive && !isActive;

    return (
      <div
        key={face}
        className={`solution-cube__face solution-cube__face--${face} ${isActive ? 'solution-cube__face--active' : ''}`}
        style={{ 
          opacity: shouldFade ? 0.15 : 1,
          transition: 'opacity 0.3s ease, filter 0.18s ease-out, box-shadow 0.18s ease-out'
        }}
      >
        {isActive && currentMove && (
          <div className="solution-cube__arrow">
            {getMoveArrow(currentMove)}
          </div>
        )}
        {faceMap[face].map((letter, idx) => (
          <div
            key={idx}
            className="solution-cube__sticker"
            style={{ backgroundColor: FACE_COLORS[letter] ?? '#777' }}
          />
        ))}
      </div>
    );
  };

  return (
    <section className="solution-player card" id="solution-player">
      <div className="solution-player__top">
        <div>
          <h2>Solution - {moves.length} moves</h2>
          <p className="text-muted">Solved in {timeMs}ms</p>
        </div>
        <div className="solution-player__current" aria-live="polite">
          {currentMove ? (
            <>
              <span className="solution-player__label">Step {step + 1}</span>
              <strong>{currentMove}</strong>
            </>
          ) : isDone ? (
            <>
              <span className="solution-player__label">Done</span>
              <strong>Solved</strong>
            </>
          ) : (
            <>
              <span className="solution-player__label">Ready</span>
              <strong>Start</strong>
            </>
          )}
        </div>
      </div>

      <div className="solution-player__stage">
        <div className="solution-cube-scene" aria-label="3D solution cube">
          <div
            className="solution-cube"
            style={{ transform: `rotateX(${view.x}deg) rotateY(${view.y}deg)` }}
          >
            {FACE_NAMES.map(renderFace)}
          </div>
        </div>
      </div>

      <div className="solution-player__controls">
        <button className="btn btn-secondary" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || isPlaying}>
          Prev
        </button>
        <button className="btn btn-primary" onClick={togglePlay} disabled={step >= moves.length}>
          {isPlaying ? 'Pause' : 'Play Slow Motion'}
        </button>
        <button className="btn btn-secondary" onClick={() => setStep(0)} disabled={step === 0 || isPlaying}>
          Reset
        </button>
        <button className="btn btn-secondary" onClick={() => setStep(Math.min(moves.length, step + 1))} disabled={step >= moves.length || isPlaying}>
          Next
        </button>
      </div>

      <div className="solution-player__moves" id="solution-moves">
        {moves.map((move, i) => (
          <button
            key={`${move}-${i}`}
            className={`solution-player__move ${i === step ? 'solution-player__move--active' : ''} ${i < step ? 'solution-player__move--done' : ''}`}
            onClick={() => setStep(i)}
            aria-label={`Show move ${i + 1}: ${move}`}
          >
            {move}
          </button>
        ))}
      </div>
    </section>
  );
}
