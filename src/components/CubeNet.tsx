/**
 * CubeNet.tsx
 * Renders an unfolded 2D cube net (cross/T layout) showing scan progress.
 * Each of the 6 faces shows either its captured colors or a placeholder.
 *
 * Standard net layout:
 *
 *        [ U ]
 *   [L]  [F]  [R]  [B]
 *        [ D ]
 */

import { CUBE_COLOR_HEX, type CubeColor, type FaceName } from '../lib/color-detection';
import './CubeNet.css';

interface CubeNetProps {
  /** 9 colors per face, or null if not yet scanned */
  faces: Record<FaceName, CubeColor[] | null>;
  /** Which face is currently being scanned */
  currentFace: FaceName;
  /** Whether all faces are captured */
  isComplete: boolean;
}

const DARKER_COLORS: Record<string, string> = {
  white:  '#d0d0d0',
  yellow: '#c8a000',
  red:    '#b81c1c',
  orange: '#c45200',
  green:  '#156b30',
  blue:   '#0f4b8f',
};

function FaceCell({
  face,
  colors,
  isCurrent,
  isComplete,
}: {
  face: FaceName;
  colors: CubeColor[] | null;
  isCurrent: boolean;
  isComplete: boolean;
}) {
  const scanned = colors !== null;
  const className = [
    'net-face',
    scanned ? 'net-face--scanned' : 'net-face--empty',
    isCurrent && !isComplete ? 'net-face--active' : '',
  ].join(' ');

  return (
    <div className={className} aria-label={`${face} face`}>
      <span className="net-face__label">{face}</span>
      <div className="net-face__grid">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="net-face__cell"
            style={{
              backgroundColor: colors
                ? (DARKER_COLORS[colors[i]] ?? CUBE_COLOR_HEX[colors[i]])
                : 'transparent',
            }}
          />
        ))}
      </div>
      {scanned && <div className="net-face__done">✓</div>}
    </div>
  );
}

export default function CubeNet({ faces, currentFace, isComplete }: CubeNetProps) {
  return (
    <div className="cube-net" aria-label="Cube scanning progress">
      {/* Row 1: just U */}
      <div className="net-row net-row--top">
        <div className="net-spacer" />
        <FaceCell face="U" colors={faces.U} isCurrent={currentFace === 'U'} isComplete={isComplete} />
        <div className="net-spacer" />
        <div className="net-spacer" />
      </div>
      {/* Row 2: L F R B */}
      <div className="net-row net-row--middle">
        <FaceCell face="L" colors={faces.L} isCurrent={currentFace === 'L'} isComplete={isComplete} />
        <FaceCell face="F" colors={faces.F} isCurrent={currentFace === 'F'} isComplete={isComplete} />
        <FaceCell face="R" colors={faces.R} isCurrent={currentFace === 'R'} isComplete={isComplete} />
        <FaceCell face="B" colors={faces.B} isCurrent={currentFace === 'B'} isComplete={isComplete} />
      </div>
      {/* Row 3: just D */}
      <div className="net-row net-row--bottom">
        <div className="net-spacer" />
        <FaceCell face="D" colors={faces.D} isCurrent={currentFace === 'D'} isComplete={isComplete} />
        <div className="net-spacer" />
        <div className="net-spacer" />
      </div>
    </div>
  );
}
