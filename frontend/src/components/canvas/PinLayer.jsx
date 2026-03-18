/**
 * components/canvas/PinLayer.jsx
 * ================================
 * Draws all pin markers (filled circles + net label).
 * Pins are fixed points; they never move, so this component is purely
 * decorative and carries no event handlers.
 */

import React from 'react';
import { Group, Circle, Text } from 'react-konva';
import { CONFIG } from '../../config/defaults.js';

const { cellSize, margin, pinRadius } = CONFIG.display;

const netColorMap = Object.fromEntries(CONFIG.nets.map(n => [n.name, n.color]));

const toPixel = (col, row) => ({
  x: margin + col * cellSize,
  y: margin + row * cellSize,
});

export default function PinLayer({ layers }) {
  const pins = layers.flatMap(layer =>
    layer.pins.map(pin => ({ ...pin, layerId: layer.id }))
  );

  return (
    <Group>
      {pins.map((pin, i) => {
        const { x, y } = toPixel(pin.x, pin.y);
        const color    = netColorMap[pin.net] ?? '#fff';
        return (
          <Group key={`pin-${i}`}>
            <Circle
              x={x}
              y={y}
              radius={pinRadius}
              fill={color}
              stroke="#fff"
              strokeWidth={1}
              listening={false}
            />
            <Text
              x={x + pinRadius + 2}
              y={y - 7}
              text={pin.net}
              fontSize={9}
              fill={color}
              listening={false}
            />
          </Group>
        );
      })}
    </Group>
  );
}
