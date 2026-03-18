/**
 * components/canvas/ICCanvas.jsx
 * ================================
 * The central Konva.js 5-layer interactive canvas.
 *
 * Layer stack (bottom → top):
 *   1. GridLayer    — static background grid
 *   2. WireLayer    — all metal-layer wires and vias
 *   3. PinLayer     — fixed pin markers
 *   4. PreviewLayer — ghost shape while the user is drawing
 *
 * Grid-snapping is performed locally (no server round-trip), so the
 * preview updates at 60 fps without any network latency.
 */

import React, { useCallback, useRef, useState } from 'react';
import { Stage, Layer } from 'react-konva';
import { CONFIG } from '../../config/defaults.js';
import GridLayer    from './GridLayer.jsx';
import WireLayer    from './WireLayer.jsx';
import PinLayer     from './PinLayer.jsx';
import PreviewLayer from './PreviewLayer.jsx';

const { cellSize, margin } = CONFIG.display;
const { width: COLS, height: ROWS } = CONFIG.grid;

const CANVAS_W = COLS * cellSize + 2 * margin;
const CANVAS_H = ROWS * cellSize + 2 * margin;

/** Snap a raw pixel position to the nearest grid cell (col, row). */
function snapToGrid(pixelX, pixelY) {
  const col = Math.round((pixelX - margin) / cellSize);
  const row = Math.round((pixelY - margin) / cellSize);
  return {
    x: Math.max(0, Math.min(COLS - 1, col)),
    y: Math.max(0, Math.min(ROWS - 1, row)),
  };
}

export default function ICCanvas({
  layout,
  activeTool,
  activeLayer,  // numeric id
  activeNet,
  onAddWire,
  onAddVia,
  onDelete,
}) {
  const [cursor,    setCursor]    = useState(null);   // snapped grid cell under mouse
  const [wireStart, setWireStart] = useState(null);   // first click for wire tool
  const stageRef = useRef(null);

  const activeLayerMeta = CONFIG.layers.find(l => l.id === activeLayer);

  // ── Mouse handlers ──────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e) => {
    const pos = e.target.getStage().getPointerPosition();
    setCursor(snapToGrid(pos.x, pos.y));
  }, []);

  const handleMouseLeave = useCallback(() => {
    setCursor(null);
  }, []);

  const handleClick = useCallback((e) => {
    const pos  = e.target.getStage().getPointerPosition();
    const cell = snapToGrid(pos.x, pos.y);

    if (activeTool === 'via') {
      const toLayer = activeLayer < CONFIG.layers.length - 1 ? activeLayer + 1 : activeLayer - 1;
      onAddVia(activeNet, cell.x, cell.y, activeLayer, toLayer);
      return;
    }

    if (activeTool === 'delete') {
      onDelete(activeLayer, cell.x, cell.y);
      return;
    }

    if (activeTool === 'wire') {
      if (!wireStart) {
        setWireStart(cell);
      } else {
        // Constrain to layer routing direction
        let ex = cell.x;
        let ey = cell.y;
        if (activeLayerMeta?.direction === 'horizontal') {
          ey = wireStart.y;
        } else {
          ex = wireStart.x;
        }

        if (ex !== wireStart.x || ey !== wireStart.y) {
          onAddWire(activeLayer, activeNet, wireStart.x, wireStart.y, ex, ey);
        }
        setWireStart(null);
      }
    }
  }, [activeTool, activeLayer, activeNet, activeLayerMeta, wireStart,
      onAddWire, onAddVia, onDelete]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') setWireStart(null);
  }, []);

  return (
    <div
      style={{ outline: 'none', cursor: activeTool === 'delete' ? 'crosshair' : 'default' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <Stage
        ref={stageRef}
        width={CANVAS_W}
        height={CANVAS_H}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{ display: 'block' }}
      >
        <Layer>
          <GridLayer />
          <WireLayer layers={layout.layers} activeLayerId={activeLayer} />
          <PinLayer  layers={layout.layers} />
          <PreviewLayer
            tool={activeTool}
            activeLayerMeta={activeLayerMeta}
            cursor={cursor}
            wireStart={wireStart}
          />
        </Layer>
      </Stage>
    </div>
  );
}
