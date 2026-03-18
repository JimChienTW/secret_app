/**
 * components/canvas/PreviewLayer.jsx
 * ====================================
 * Shows a semi-transparent preview of the wire/via the user is about
 * to place.  Rendered entirely from props — no local state.
 */

import React from 'react';
import { Group, Line, Rect, Circle } from 'react-konva';
import { CONFIG } from '../../config/defaults.js';

const { cellSize, margin, wireWidth, viaSize, previewAlpha, pinRadius } = CONFIG.display;

const toPixel = (col, row) => ({
  x: margin + col * cellSize,
  y: margin + row * cellSize,
});

export default function PreviewLayer({ tool, activeLayerMeta, cursor, wireStart }) {
  if (!cursor) return null;

  const color = activeLayerMeta?.color ?? '#fff';

  if (tool === 'via') {
    const { x, y } = toPixel(cursor.x, cursor.y);
    return (
      <Rect
        x={x - viaSize}
        y={y - viaSize}
        width={viaSize * 2}
        height={viaSize * 2}
        fill={color}
        opacity={previewAlpha}
        cornerRadius={2}
        listening={false}
      />
    );
  }

  if (tool === 'wire') {
    if (!wireStart) {
      // No start yet — just highlight cursor cell
      const { x, y } = toPixel(cursor.x, cursor.y);
      return (
        <Circle
          x={x}
          y={y}
          radius={pinRadius + 2}
          stroke={color}
          strokeWidth={1.5}
          opacity={previewAlpha}
          listening={false}
        />
      );
    }

    // Constrain endpoint to layer direction
    let ex = cursor.x;
    let ey = cursor.y;
    if (activeLayerMeta?.direction === 'horizontal') {
      ey = wireStart.y;
    } else {
      ex = wireStart.x;
    }

    const start = toPixel(wireStart.x, wireStart.y);
    const end   = toPixel(ex, ey);

    return (
      <Group>
        <Circle
          x={start.x}
          y={start.y}
          radius={pinRadius + 2}
          fill={color}
          opacity={previewAlpha}
          listening={false}
        />
        <Line
          points={[start.x, start.y, end.x, end.y]}
          stroke={color}
          strokeWidth={wireWidth}
          opacity={previewAlpha}
          lineCap="round"
          dash={[6, 3]}
          listening={false}
        />
      </Group>
    );
  }

  return null;
}
