/**
 * canvas.js
 * =========
 * CanvasRenderer — responsible ONLY for drawing.
 *
 * It knows nothing about app state or user interactions; those are handled
 * in main.js.  Call renderer.render(state) whenever anything changes.
 *
 * You should only need to edit this file if you want to change how wires,
 * pins, or vias look visually.
 */

class CanvasRenderer {
  /**
   * @param {HTMLCanvasElement} canvasEl  The <canvas> element to paint on.
   * @param {object}            config    The global CONFIG object (config.js).
   */
  constructor(canvasEl, config) {
    this.canvas = canvasEl;
    this.ctx    = canvasEl.getContext('2d');
    this.config = config;
    this._resize();
  }

  // ── Canvas sizing ─────────────────────────────────────────────────────────

  /** Set canvas pixel dimensions from CONFIG. Called once during setup. */
  _resize() {
    const { cellSize, margin } = this.config.display;
    const { width, height }   = this.config.grid;
    this.canvas.width  = width  * cellSize + 2 * margin;
    this.canvas.height = height * cellSize + 2 * margin;
  }

  // ── Coordinate helpers ───────────────────────────────────────────────────

  /**
   * Convert a grid cell (col, row) to the pixel centre of that cell.
   * @returns {{ px: number, py: number }}
   */
  gridToPixel(col, row) {
    const { cellSize, margin } = this.config.display;
    return {
      px: margin + col * cellSize + cellSize / 2,
      py: margin + row * cellSize + cellSize / 2,
    };
  }

  /**
   * Convert a canvas pixel position to the grid cell it belongs to.
   * The result may be out-of-bounds; check with inBounds() before using.
   * @returns {{ x: number, y: number }}
   */
  pixelToGrid(px, py) {
    const { cellSize, margin } = this.config.display;
    return {
      x: Math.floor((px - margin) / cellSize),
      y: Math.floor((py - margin) / cellSize),
    };
  }

  /** Return true if (col, row) lies inside the grid. */
  inBounds(col, row) {
    return (
      col >= 0 && col < this.config.grid.width &&
      row >= 0 && row < this.config.grid.height
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  /**
   * Full repaint. Call this whenever the app state changes.
   * @param {object} state  Global app state object from main.js.
   */
  render(state) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this._drawBackground();
    this._drawGrid();
    this._drawWires(state);
    this._drawVias(state);
    this._drawPins(state);
    this._drawDrcViolations(state);
    this._drawWirePreview(state);
    this._drawHoverHighlight(state);
  }

  // ── Private drawing methods ───────────────────────────────────────────────

  _drawBackground() {
    this.ctx.fillStyle = this.config.display.bgColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _drawGrid() {
    const { ctx }                                        = this;
    const { cellSize, margin, gridLineColor, gridDotColor } = this.config.display;
    const { width, height }                              = this.config.grid;

    // Faint grid lines
    ctx.strokeStyle = gridLineColor;
    ctx.lineWidth   = 0.5;
    for (let c = 0; c <= width; c++) {
      ctx.beginPath();
      ctx.moveTo(margin + c * cellSize, margin);
      ctx.lineTo(margin + c * cellSize, margin + height * cellSize);
      ctx.stroke();
    }
    for (let r = 0; r <= height; r++) {
      ctx.beginPath();
      ctx.moveTo(margin,                    margin + r * cellSize);
      ctx.lineTo(margin + width * cellSize, margin + r * cellSize);
      ctx.stroke();
    }

    // Dots at every intersection
    ctx.fillStyle = gridDotColor;
    for (let c = 0; c <= width; c++) {
      for (let r = 0; r <= height; r++) {
        ctx.beginPath();
        ctx.arc(margin + c * cellSize, margin + r * cellSize, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Small axis labels along the top and left edges
    ctx.fillStyle    = '#3a3a66';
    ctx.font         = '9px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    for (let c = 0; c < width; c++) {
      ctx.fillText(c, margin + c * cellSize + cellSize / 2, margin - 2);
    }
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < height; r++) {
      ctx.fillText(r, margin - 4, margin + r * cellSize + cellSize / 2);
    }
  }

  /**
   * Draw wires.
   * The current layer is fully opaque; other layers are drawn faintly
   * so the user can see routing context without distraction.
   */
  _drawWires(state) {
    const { ctx }      = this;
    const { wireWidth } = this.config.display;

    for (const layer of state.layout.layers) {
      if (layer.wires.length === 0) continue;
      const isCurrent    = layer.id === state.currentLayerId;
      ctx.globalAlpha    = isCurrent ? 1.0 : 0.12;
      ctx.lineWidth      = wireWidth;
      ctx.lineCap        = 'round';

      for (const wire of layer.wires) {
        const p1 = this.gridToPixel(wire.x1, wire.y1);
        const p2 = this.gridToPixel(wire.x2, wire.y2);
        ctx.strokeStyle = this._netColor(wire.net);
        ctx.beginPath();
        ctx.moveTo(p1.px, p1.py);
        ctx.lineTo(p2.px, p2.py);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1.0;
  }

  /**
   * Draw vias.
   * A via is shown on every layer it connects, so it appears on both
   * the source layer and the destination layer.
   */
  _drawVias(state) {
    const { ctx }  = this;
    const { viaSize } = this.config.display;

    for (const layer of state.layout.layers) {
      for (const via of layer.vias) {
        // Is this via visible on the current layer?
        const onCurrent =
          via.from_layer === state.currentLayerId ||
          via.to_layer   === state.currentLayerId;

        ctx.globalAlpha = onCurrent ? 1.0 : 0.12;

        const { px, py } = this.gridToPixel(via.x, via.y);
        const color      = this._netColor(via.net);

        // Square with a translucent fill + X inside = standard via symbol
        ctx.strokeStyle = color;
        ctx.fillStyle   = color + '33'; // 20% opacity fill
        ctx.lineWidth   = 2;
        ctx.strokeRect(px - viaSize, py - viaSize, viaSize * 2, viaSize * 2);
        ctx.fillRect  (px - viaSize, py - viaSize, viaSize * 2, viaSize * 2);
        ctx.beginPath();
        ctx.moveTo(px - viaSize, py - viaSize); ctx.lineTo(px + viaSize, py + viaSize);
        ctx.moveTo(px + viaSize, py - viaSize); ctx.lineTo(px - viaSize, py + viaSize);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1.0;
  }

  /**
   * Draw pin markers and their net labels.
   * Pins on other layers are drawn faintly for reference.
   */
  _drawPins(state) {
    const { ctx }             = this;
    const { pinRadius }       = this.config.display;

    for (const layer of state.layout.layers) {
      const isCurrent    = layer.id === state.currentLayerId;
      ctx.globalAlpha    = isCurrent ? 1.0 : 0.12;

      for (const pin of layer.pins) {
        const { px, py } = this.gridToPixel(pin.x, pin.y);
        const color      = this._netColor(pin.net);

        // Filled circle with white border
        ctx.fillStyle   = color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, pinRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Net name label above the pin (only on the active layer)
        if (isCurrent) {
          ctx.fillStyle    = '#ffffff';
          ctx.font         = 'bold 8px monospace';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(pin.net, px, py - pinRadius - 2);
        }
      }
    }
    ctx.globalAlpha = 1.0;
  }

  /**
   * Overlay red highlights on cells that have DRC violations on the
   * currently visible layer.
   */
  _drawDrcViolations(state) {
    if (!state.drcResult) return;
    const { ctx }      = this;
    const { cellSize } = this.config.display;
    const half         = cellSize / 2;

    for (const v of state.drcResult.violations) {
      const loc = v.location || {};
      // Only highlight if we have coordinates and the layer matches
      if (loc.x === undefined) continue;
      if (loc.layer !== undefined && loc.layer !== state.currentLayerId) continue;

      const { px, py } = this.gridToPixel(loc.x, loc.y);
      ctx.fillStyle   = 'rgba(239,68,68,0.20)';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth   = 1.5;
      ctx.fillRect  (px - half, py - half, cellSize, cellSize);
      ctx.strokeRect(px - half, py - half, cellSize, cellSize);
    }
  }

  /** Dashed preview line while the user is mid-draw. */
  _drawWirePreview(state) {
    if (!state.drawing || !state.previewEnd) return;
    const { ctx }                     = this;
    const { wireWidth, previewAlpha } = this.config.display;

    const p1 = this.gridToPixel(state.drawing.startX, state.drawing.startY);
    const p2 = this.gridToPixel(state.previewEnd.x,   state.previewEnd.y);

    ctx.globalAlpha = previewAlpha;
    ctx.strokeStyle = this._netColor(state.currentNetName);
    ctx.lineWidth   = wireWidth;
    ctx.lineCap     = 'round';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(p1.px, p1.py);
    ctx.lineTo(p2.px, p2.py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
  }

  /** Faint highlight over the grid cell the cursor is hovering over. */
  _drawHoverHighlight(state) {
    if (!state.hoveredCell) return;
    const { ctx }                     = this;
    const { cellSize, margin, hoverAlpha } = this.config.display;
    const { x, y }                    = state.hoveredCell;

    ctx.fillStyle = `rgba(255,255,255,${hoverAlpha})`;
    ctx.fillRect(margin + x * cellSize, margin + y * cellSize, cellSize, cellSize);
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  /** Return the hex colour for a net name, or white if not found. */
  _netColor(netName) {
    const net = this.config.nets.find(n => n.name === netName);
    return net ? net.color : '#ffffff';
  }
}
