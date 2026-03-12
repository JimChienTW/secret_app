/**
 * config.js
 * =========
 * *** THIS IS THE ONLY FILE YOU NEED TO EDIT FOR MOST CUSTOMIZATIONS ***
 *
 * All settings that control the behaviour and appearance of the tool are
 * defined here. You do not need to touch any other JavaScript file for
 * basic configuration changes.
 */

const CONFIG = {

  // ──────────────────────────────────────────────────────────────────────────
  // GRID
  // How many columns (width) and rows (height) the routing grid has.
  // ──────────────────────────────────────────────────────────────────────────
  grid: {
    width:  20,   // number of columns  (x-axis, 0-based)
    height: 20,   // number of rows     (y-axis, 0-based)
  },

  // ──────────────────────────────────────────────────────────────────────────
  // DISPLAY
  // Pixel-level visual settings.  Adjust these to change how the canvas looks.
  // ──────────────────────────────────────────────────────────────────────────
  display: {
    cellSize:      28,        // px size of each grid cell (increase for larger canvas)
    margin:        30,        // empty border around the grid in px
    bgColor:       '#10101e', // canvas background colour
    gridLineColor: '#1a1a38', // faint lines between cells
    gridDotColor:  '#252550', // dots at grid intersections
    wireWidth:     3,         // drawn wire thickness in px
    pinRadius:     5,         // pin circle radius in px
    viaSize:       7,         // half-size of the via square marker in px
    previewAlpha:  0.45,      // opacity of the wire preview while drawing (0–1)
    hoverAlpha:    0.10,      // opacity of the cell highlight under the cursor (0–1)
  },

  // ──────────────────────────────────────────────────────────────────────────
  // LAYERS
  // Each entry represents one metal layer of the 3-D IC.
  //
  //   id        — unique integer, must start at 0 and be consecutive
  //   name      — label shown in the UI (e.g. 'M1', 'M2')
  //   direction — 'horizontal' → wires may only run left/right on this layer
  //               'vertical'   → wires may only run up/down on this layer
  //   color     — hex colour used to draw wires/vias on this layer
  //
  // To add a layer: copy one entry, increment the id, and set direction/color.
  // ──────────────────────────────────────────────────────────────────────────
  layers: [
    { id: 0, name: 'M1', direction: 'horizontal', color: '#e64980' },
    { id: 1, name: 'M2', direction: 'vertical',   color: '#40c057' },
    { id: 2, name: 'M3', direction: 'horizontal', color: '#228be6' },
    { id: 3, name: 'M4', direction: 'vertical',   color: '#ae3ec9' },
  ],

  // ──────────────────────────────────────────────────────────────────────────
  // NETS
  // Each net is a named signal that must be fully connected by routing.
  //
  //   name  — signal name shown in the UI (e.g. 'VDD', 'CLK')
  //   color — hex colour for this net's wires and pin markers
  //   pins  — list of fixed endpoints:  { layer: <id>, x: <col>, y: <row> }
  //           Coordinates are 0-based (top-left corner = 0, 0).
  //
  // *** ADD YOUR OWN NETS HERE.  Each net must have at least 2 pins. ***
  // All pins below are placed on layer 0 (M1).  Change 'layer' to place
  // a pin on a different layer.
  // ──────────────────────────────────────────────────────────────────────────
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

  // ──────────────────────────────────────────────────────────────────────────
  // BACKEND
  // URL of the Python/Flask server started with:  python backend/app.py
  // Change this if Flask runs on a different port or hostname.
  // ──────────────────────────────────────────────────────────────────────────
  apiBase: 'http://localhost:5000',
};
