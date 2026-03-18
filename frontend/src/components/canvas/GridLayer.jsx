/**
 * components/canvas/GridLayer.jsx
 * ================================
 * Draws the background: solid fill, faint grid lines, and intersection dots.
 * Rendered once; only updates when grid size or display config changes.
 */

import React from 'react';
import { Rect, Line, Circle, Group } from 'react-konva';
import { CONFIG } from '../../config/defaults.js';

export default function GridLayer() {
  const { cellSize, margin, bgColor, gridLineColor, gridDotColor } = CONFIG.display;
  const { width: cols, height: rows } = CONFIG.grid;

  const canvasW = cols * cellSize + 2 * margin;
  const canvasH = rows * cellSize + 2 * margin;

  const lines = [];

  // Vertical grid lines
  for (let c = 0; c <= cols; c++) {
    const x = margin + c * cellSize;
    lines.push(
      <Line
        key={`vl-${c}`}
        points={[x, margin, x, canvasH - margin]}
        stroke={gridLineColor}
        strokeWidth={0.5}
        listening={false}
      />
    );
  }

  // Horizontal grid lines
  for (let r = 0; r <= rows; r++) {
    const y = margin + r * cellSize;
    lines.push(
      <Line
        key={`hl-${r}`}
        points={[margin, y, canvasW - margin, y]}
        stroke={gridLineColor}
        strokeWidth={0.5}
        listening={false}
      />
    );
  }

  // Intersection dots
  const dots = [];
  for (let c = 0; c <= cols; c++) {
    for (let r = 0; r <= rows; r++) {
      dots.push(
        <Circle
          key={`dot-${c}-${r}`}
          x={margin + c * cellSize}
          y={margin + r * cellSize}
          radius={1.5}
          fill={gridDotColor}
          listening={false}
        />
      );
    }
  }

  return (
    <Group>
      {/* Canvas background */}
      <Rect
        x={0}
        y={0}
        width={canvasW}
        height={canvasH}
        fill={bgColor}
        listening={false}
      />
      {lines}
      {dots}
    </Group>
  );
}
