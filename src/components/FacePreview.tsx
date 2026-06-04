/**
 * FacePreview.tsx
 * Renders a 3×3 grid of colored cells representing a scanned Rubik's cube face.
 */

import { CubeColor, CUBE_COLOR_HEX, type FaceName } from '../lib/color-detection';
import './FacePreview.css';

interface FacePreviewProps {
  /** 9 colors in row-major order, or null if not scanned */
  colors: CubeColor[] | null;
  /** Face label (e.g. 'U') */
  face: FaceName;
  /** Whether this face is currently being scanned */
  isActive?: boolean;
  /** Callback when clicked (to re-scan) */
  onClick?: () => void;
  /** Size variant */
  size?: 'sm' | 'md';
}

export default function FacePreview({
  colors,
  face,
  isActive = false,
  onClick,
  size = 'sm',
}: FacePreviewProps) {
  const sizeClass = size === 'md' ? 'face-preview--md' : 'face-preview--sm';

  return (
    <button
      className={`face-preview ${sizeClass} ${isActive ? 'face-preview--active' : ''} ${colors ? 'face-preview--scanned' : ''}`}
      onClick={onClick}
      type="button"
      title={colors ? `Re-scan ${face} face` : `${face} face (not scanned)`}
      id={`face-preview-${face}`}
    >
      <span className="face-preview__label">{face}</span>
      <div className="face-preview__grid">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="face-preview__cell"
            style={{
              backgroundColor: colors
                ? CUBE_COLOR_HEX[colors[i]]
                : 'var(--bg-glass)',
            }}
          />
        ))}
      </div>
    </button>
  );
}
