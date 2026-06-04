/**
 * CameraScanner.tsx
 * Webcam-based cube face scanner with 3×3 grid overlay.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { extractFaceColors, FACE_LABELS, FACE_NAMES, type GridRect } from '../lib/color-detection';
import { useScanStore } from '../stores/scan-store';
import CubeNet from './CubeNet';
import './CameraScanner.css';

export default function CameraScanner() {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const overlayRef  = useRef<HTMLCanvasElement>(null);
  const analysisRef = useRef<HTMLCanvasElement>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const {
    faces,
    currentFace,
    isComplete,
    captureFace,
    resetFace,
    resetAll,
  } = useScanStore();

  // ── Start camera ───────────────────────────────────────────────────────────

  useEffect(() => {
    let stream: MediaStream | null = null;
    let isCancelled = false;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        });
        if (isCancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch (playErr: any) {
            // Ignore interruption errors from React StrictMode unmounting
            if (playErr.name !== 'NotAllowedError' && playErr.name !== 'AbortError') {
              console.warn('Video play interrupted:', playErr);
            }
          }
          if (!isCancelled) {
            setCameraReady(true);
          }
        }
      } catch (err: any) {
        if (!isCancelled) {
          setCameraError(
            err.name === 'NotAllowedError'
              ? 'Camera access denied. Please allow camera permissions and reload.'
              : `Camera error: ${err.message}`,
          );
        }
      }
    }

    startCamera();

    return () => {
      isCancelled = true;
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Draw grid overlay ──────────────────────────────────────────────────────

  const getGridRect = useCallback((): GridRect | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;

    // The grid is a square centered in the video area
    const vw = video.clientWidth;
    const vh = video.clientHeight;
    const size = Math.min(vw, vh) * 0.6; // 60% of smaller dimension
    const x = (vw - size) / 2;
    const y = (vh - size) / 2;

    return { x, y, width: size, height: size };
  }, []);

  useEffect(() => {
    if (!cameraReady) return;

    const canvas = overlayRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;

    let animId: number;

    function drawOverlay() {
      const ctx = canvas!.getContext('2d');
      if (!ctx || !video) return;

      canvas!.width  = video!.clientWidth;
      canvas!.height = video!.clientHeight;

      ctx.clearRect(0, 0, canvas!.width, canvas!.height);

      const grid = getGridRect();
      if (!grid) return;

      // Semi-transparent darkened area outside the grid
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas!.width, canvas!.height);
      ctx.clearRect(grid.x, grid.y, grid.width, grid.height);

      // Grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 2;

      // Outer border
      ctx.strokeRect(grid.x, grid.y, grid.width, grid.height);

      // Inner grid lines
      const cellW = grid.width / 3;
      const cellH = grid.height / 3;

      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';

      for (let i = 1; i < 3; i++) {
        // Vertical
        ctx.beginPath();
        ctx.moveTo(grid.x + cellW * i, grid.y);
        ctx.lineTo(grid.x + cellW * i, grid.y + grid.height);
        ctx.stroke();
        // Horizontal
        ctx.beginPath();
        ctx.moveTo(grid.x, grid.y + cellH * i);
        ctx.lineTo(grid.x + grid.width, grid.y + cellH * i);
        ctx.stroke();
      }

      // Center dot markers for each cell
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const cx = grid.x + cellW * (col + 0.5);
          const cy = grid.y + cellH * (row + 0.5);
          ctx.beginPath();
          ctx.arc(cx, cy, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(drawOverlay);
    }

    drawOverlay();
    return () => cancelAnimationFrame(animId);
  }, [cameraReady, getGridRect]);

  // ── Capture face ───────────────────────────────────────────────────────────

  const handleCapture = useCallback(() => {
    const video    = videoRef.current;
    const analysis = analysisRef.current;
    if (!video || !analysis) return;

    // Draw video frame to analysis canvas at native resolution
    analysis.width  = video.videoWidth;
    analysis.height = video.videoHeight;
    const ctx = analysis.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    // Map grid rect from CSS coords to native video coords
    const scaleX = video.videoWidth  / video.clientWidth;
    const scaleY = video.videoHeight / video.clientHeight;
    const cssGrid = getGridRect();
    if (!cssGrid) return;

    const nativeGrid: GridRect = {
      x:      cssGrid.x * scaleX,
      y:      cssGrid.y * scaleY,
      width:  cssGrid.width * scaleX,
      height: cssGrid.height * scaleY,
    };

    const colors = extractFaceColors(ctx, nativeGrid);
    captureFace(colors);
  }, [getGridRect, captureFace]);

  // ── Error state ────────────────────────────────────────────────────────────

  if (cameraError) {
    return (
      <div className="scanner-error card animate-fade-in" id="camera-error">
        <div className="scanner-error__icon">📷</div>
        <h2>Camera Unavailable</h2>
        <p className="text-secondary">{cameraError}</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="scanner animate-fade-in" id="camera-scanner">

      {/* Cube net progress display */}
      <div className="scanner__net-wrapper">
        <p className="scanner__net-label">
          {isComplete ? '✅ All 6 faces captured!' : `Scanning face ${FACE_NAMES.indexOf(currentFace) + 1} / 6`}
        </p>
        <CubeNet faces={faces} currentFace={currentFace} isComplete={isComplete} />
        {!isComplete && (
          <p className="scanner__net-hint">
            Click a face to re-scan it
          </p>
        )}
      </div>

      {/* Instructions */}
      <div className="scanner__instructions" id="scan-instructions">
        {isComplete ? (
          <p className="text-center">
            ✅ All faces scanned! Press <strong>Solve</strong> to get the solution.
          </p>
        ) : (
          <p className="text-center">
            Align the <strong>{FACE_LABELS[currentFace]}</strong> face in the grid, then press <strong>Capture</strong>.
          </p>
        )}
      </div>

      {/* Video + overlay */}
      <div className="scanner__viewport" id="camera-viewport">
        <video
          ref={videoRef}
          className="scanner__video"
          playsInline
          muted
          id="camera-video"
        />
        <canvas ref={overlayRef} className="scanner__overlay" id="grid-overlay" />
        <canvas ref={analysisRef} className="scanner__analysis" />

        {!cameraReady && (
          <div className="scanner__loading">
            <div className="scanner__spinner" />
            <p>Starting camera…</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="scanner__controls" id="scan-controls">
        <button
          className="btn btn-primary btn-lg"
          onClick={handleCapture}
          disabled={!cameraReady || isComplete}
          id="capture-btn"
        >
          📸 Capture {currentFace} Face
        </button>
        <button
          className="btn btn-secondary"
          onClick={resetAll}
          id="reset-btn"
        >
          ↻ Reset All
        </button>
      </div>
    </div>
  );
}
