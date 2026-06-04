import { useState, useRef } from 'react';
import { useManualStore } from '../stores/manual-store';
import { FACE_NAMES, FaceName, CubeColor } from '../lib/color-detection';
import './InteractiveCube.css';

interface InteractiveCubeProps {
  onUserAction?: () => void;
}

// Darker, more distinguishable cube colors
const CSS_COLOR_MAP: Record<string, string> = {
  [CubeColor.White]:  '#d8d8d8',
  [CubeColor.Yellow]: '#c8a000',
  [CubeColor.Red]:    '#b81c1c',
  [CubeColor.Orange]: '#c45200',
  [CubeColor.Green]:  '#156b30',
  [CubeColor.Blue]:   '#0f4b8f',
};

export default function InteractiveCube({ onUserAction }: InteractiveCubeProps) {
  const { faces, paintFacelet } = useManualStore();
  const sceneRef = useRef<HTMLDivElement>(null);

  // Rotation state
  const [rotX, setRotX] = useState(-25); // initial isometric view
  const [rotY, setRotY] = useState(-45);

  // Dragging state
  const isDragging = useRef(false);
  const hasMoved = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // ── Drag to rotate ─────────────────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    hasMoved.current = false;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    if (sceneRef.current) {
      sceneRef.current.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;

    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;

    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      hasMoved.current = true;
    }

    setRotY((prev) => prev + dx * 0.5);
    setRotX((prev) => prev - dy * 0.5);

    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const resetDragState = (e: React.PointerEvent) => {
    isDragging.current = false;
    if (sceneRef.current) {
      try {
        sceneRef.current.releasePointerCapture(e.pointerId);
      } catch { /* already released */ }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const wasClick = !hasMoved.current;
    resetDragState(e);

    // If we didn't move, treat it as a click.
    // Because of pointer capture, the event target is the scene, not the facelet.
    if (wasClick) {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (target && target.classList.contains('cube-facelet')) {
        (target as HTMLElement).click();
      }
    }
    // Always reset hasMoved after pointer up
    hasMoved.current = false;
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    // Only reset if we aren't capturing (i.e. drag left the element boundary)
    if (!isDragging.current) return;
    // Pointer capture keeps events flowing even outside — only reset if truly released
    // We don't reset hasMoved here so mid-drag leaves don't cause accidental paints
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    resetDragState(e);
    hasMoved.current = false;
  };

  // ── Paint facelet ──────────────────────────────────────────────────────────

  const handleFaceletClick = (_e: React.MouseEvent, face: FaceName, index: number) => {
    onUserAction?.();
    paintFacelet(face, index);
  };

  // ── Render faces ───────────────────────────────────────────────────────────

  const renderFace = (face: FaceName) => {
    const colors = faces[face];
    return (
      <div key={face} className={`cube-face cube-face--${face}`}>
        {colors.map((color, idx) => (
          <div
            key={idx}
            className="cube-facelet"
            style={{ backgroundColor: CSS_COLOR_MAP[color] ?? '#888' }}
            onClick={(e) => handleFaceletClick(e, face, idx)}
            data-face={face}
            data-idx={idx}
          />
        ))}
      </div>
    );
  };

  return (
    <div
      className="cube-scene"
      ref={sceneRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerCancel}
      style={{ touchAction: 'none' }}
    >
      <div
        className="cube"
        style={{ transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)` }}
      >
        {FACE_NAMES.map(renderFace)}
      </div>
    </div>
  );
}
