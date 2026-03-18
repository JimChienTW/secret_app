/**
 * config/defaults.js
 * ==================
 * Central configuration — edit this file to customise the tool.
 *
 * This file mirrors the old config.js from the vanilla-JS frontend,
 * updated with a 5-layer (M1–M5) stack and a React/Vite-friendly format.
 */

export const CONFIG = {
  // ── Grid ───────────────────────────────────────────────────────────────
  grid: {
    width:  20,   // columns  (x-axis, 0-based)
    height: 20,   // rows     (y-axis, 0-based)
  },

  // ── Display ────────────────────────────────────────────────────────────
  display: {
    cellSize:      28,         // px per grid cell
    margin:        30,         // px border around the grid
    bgColor:       '#10101e',
    gridLineColor: '#1a1a38',
    gridDotColor:  '#252550',
    wireWidth:     3,
    pinRadius:     5,
    viaSize:       7,
    previewAlpha:  0.45,
    hoverAlpha:    0.10,
  },

  // ── 5 Metal layers ─────────────────────────────────────────────────────
  layers: [
    { id: 0, name: 'M1', direction: 'horizontal', color: '#e64980' },
    { id: 1, name: 'M2', direction: 'vertical',   color: '#40c057' },
    { id: 2, name: 'M3', direction: 'horizontal', color: '#228be6' },
    { id: 3, name: 'M4', direction: 'vertical',   color: '#ae3ec9' },
    { id: 4, name: 'M5', direction: 'horizontal', color: '#fd7e14' },
  ],

  // ── Nets ───────────────────────────────────────────────────────────────
  nets: [
    {
      name:  'VDD',
      color: '#ff6b6b',
      pins:  [
        { layer: 0, x:  1, y:  1 },
        { layer: 0, x: 18, y:  1 },
      ],
    },
    {
      name:  'GND',
      color: '#74c0fc',
      pins:  [
        { layer: 0, x:  1, y: 18 },
        { layer: 0, x: 18, y: 18 },
      ],
    },
    {
      name:  'CLK',
      color: '#69db7c',
      pins:  [
        { layer: 0, x:  3, y:  1 },
        { layer: 0, x: 16, y: 18 },
      ],
    },
    {
      name:  'DATA',
      color: '#ffd43b',
      pins:  [
        { layer: 0, x:  5, y:  5 },
        { layer: 0, x: 14, y: 14 },
      ],
    },
    {
      name:  'RESET',
      color: '#da77f2',
      pins:  [
        { layer: 0, x: 10, y:  1 },
        { layer: 0, x: 10, y: 18 },
      ],
    },
  ],

  // ── Backend ────────────────────────────────────────────────────────────
  // During development (Vite dev server) all /api/* requests are proxied
  // to the FastAPI backend (see vite.config.js).
  // In production, FastAPI serves the built frontend directly.
  apiBase: '',
};

/**
 * Build the initial layout object from CONFIG.
 * Pins are placed on each layer as configured per-net.
 */
export function buildInitialLayout() {
  const layers = CONFIG.layers.map(l => ({
    id:        l.id,
    name:      l.name,
    direction: l.direction,
    wires:     [],
    vias:      [],
    pins:      CONFIG.nets.flatMap(net =>
      net.pins
        .filter(p => p.layer === l.id)
        .map(p => ({ net: net.name, x: p.x, y: p.y }))
    ),
  }));

  return {
    grid_size: { ...CONFIG.grid },
    nets:      CONFIG.nets.map(n => n.name),
    layers,
  };
}
