/**
 * components/canvas/WireLayer.jsx
 * =================================
 * Renders all wire segments and via markers for every metal layer.
 *
 * Each metal layer gets its own Konva Group so layers can be toggled
 * individually.  Wires on the current active layer are drawn with full
 * opacity; inactive layers are dimmed.
 */

import React from 'react';
import { Group, Line, Rect } from 'react-konva';
import { CONFIG } from '../../config/defaults.js';

const { cellSize, margin, wireWidth, viaSize } = CONFIG.display;

/** Convert a grid column/row to canvas pixel coordinates. */
const toPixel = (col, row) => ({
  x: margin + col * cellSize,
  y: margin + row * cellSize,
});

function WireSegment({ wire, color, opacity }) {
  const start = toPixel(wire.x1, wire.y1);
  const end   = toPixel(wire.x2, wire.y2);
  return (
    <Line
      points={[start.x, start.y, end.x, end.y]}
      stroke={color}
      strokeWidth={wireWidth}
      opacity={opacity}
      lineCap="round"
      listening={false}
    />
  );
}

function ViaMarker({ via, color, opacity }) {
  const { x, y } = toPixel(via.x, via.y);
  return (
    <Rect
      x={x - viaSize}
      y={y - viaSize}
      width={viaSize * 2}
      height={viaSize * 2}
      fill={color}
      opacity={opacity}
      cornerRadius={2}
      listening={false}
    />
  );
}

export default function WireLayer({ layers, activeLayerId }) {
  return (
    <Group>
      {layers.map(layer => {
        const meta    = CONFIG.layers.find(l => l.id === layer.id) ?? {};
        const color   = meta.color ?? '#888';
        const opacity = layer.id === activeLayerId ? 1.0 : 0.35;

        return (
          <Group key={`layer-${layer.id}`} opacity={opacity}>
            {layer.wires.map((wire, i) => (
              <WireSegment key={`w-${layer.id}-${i}`} wire={wire} color={color} opacity={1} />
            ))}
            {layer.vias.map((via, i) => (
              <ViaMarker key={`v-${layer.id}-${i}`} via={via} color={color} opacity={1} />
            ))}
          </Group>
        );
      })}
    </Group>
  );
}
