/**
 * main.js
 * =======
 * Application entry point — state management, user interactions, and backend
 * communication.
 *
 * ─── Sections ───────────────────────────────────────────────────────────────
 *  1. App state
 *  2. Layout initialisation  (builds the layout object from CONFIG)
 *  3. UI setup               (buttons, selectors, event bindings)
 *  4. Canvas event handlers  (mouse move, click)
 *  5. Tool actions           (addWire, addVia, deleteAt, undo)
 *  6. Backend actions        (autoRoute, runDRC, save, export, session)
 *  7. UI updaters            (layer panel, net swatch, DRC panel, hints)
 *  8. Internal helpers
 *  9. Bootstrap              (runs once on page load)
 * ────────────────────────────────────────────────────────────────────────────
 */

// ════════════════════════════════════════════════════════════════════════════
// 1. App State
// ════════════════════════════════════════════════════════════════════════════

const state = {
  sessionId:      null,                     // current session UUID from the backend
  currentLayerId: 0,                        // which layer is being viewed / edited
  currentNetName: CONFIG.nets[0].name,      // active net for drawing
  currentTool:    'wire',                   // 'wire' | 'via' | 'delete'
  drawing:        null,                     // { startX, startY } when drawing a wire
  previewEnd:     null,                     // { x, y } constrained endpoint for preview
  hoveredCell:    null,                     // { x, y } grid cell under the cursor
  layout:         null,                     // full layout object (mirrors backend schema)
  history:        [],                       // undo stack — stores JSON snapshots
  drcResult:      null,                     // last DRC result from the backend
};

// ════════════════════════════════════════════════════════════════════════════
// 2. Layout initialisation
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build the initial layout object from CONFIG.
 * This is the data structure that gets sent to the backend.
 * Call this again (+ renderer.render) to reset to a blank layout.
 */
function initLayout() {
  state.layout = {
    grid_size: { width: CONFIG.grid.width, height: CONFIG.grid.height },
    nets:      CONFIG.nets.map(n => n.name),
    layers:    CONFIG.layers.map(cfgLayer => {
      // Gather all pins whose 'layer' field matches this layer id
      const pins = [];
      for (const net of CONFIG.nets) {
        for (const pin of net.pins) {
          if (pin.layer === cfgLayer.id) {
            pins.push({ net: net.name, x: pin.x, y: pin.y });
          }
        }
      }
      return {
        id:        cfgLayer.id,
        name:      cfgLayer.name,
        direction: cfgLayer.direction,
        color:     cfgLayer.color,
        pins,
        wires: [],   // populated by the user or auto-router
        vias:  [],   // populated by the user or auto-router
      };
    }),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 3. UI setup
// ════════════════════════════════════════════════════════════════════════════

/** Create one button per layer in the left panel. */
function buildLayerButtons() {
  const container = document.getElementById('layer-buttons');
  container.innerHTML = '';
  for (const layer of CONFIG.layers) {
    const btn = document.createElement('button');
    btn.className       = 'layer-btn' + (layer.id === state.currentLayerId ? ' active' : '');
    btn.dataset.layerId = layer.id;
    // Colour swatch + name + direction arrow
    btn.innerHTML = `
      <span class="layer-swatch" style="background:${layer.color}"></span>
      <span class="layer-name">${layer.name}</span>
      <span class="layer-dir">${layer.direction === 'horizontal' ? '←→' : '↕'}</span>
    `;
    btn.addEventListener('click', () => setLayer(layer.id));
    container.appendChild(btn);
  }
}

/** Populate the net <select> dropdown from CONFIG.nets. */
function buildNetSelector() {
  const sel = document.getElementById('net-select');
  sel.innerHTML = '';
  for (const net of CONFIG.nets) {
    const opt       = document.createElement('option');
    opt.value       = net.name;
    opt.textContent = net.name;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    state.currentNetName = sel.value;
    updateNetSwatch();
    renderer.render(state);
  });
}

/** Wire up all button click handlers. */
function bindButtons() {
  // Tool buttons (Wire / Via / Delete)
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  // Undo
  document.getElementById('btn-undo').addEventListener('click', undo);

  // Top-bar actions
  document.getElementById('btn-new-session').addEventListener('click', startNewSession);
  document.getElementById('btn-save').addEventListener('click',        saveSession);
  document.getElementById('btn-export').addEventListener('click',      exportSession);

  // Auto-route
  document.getElementById('btn-autoroute-net').addEventListener('click', autoRouteCurrentNet);
  document.getElementById('btn-autoroute-all').addEventListener('click', autoRouteAll);

  // DRC
  document.getElementById('btn-drc').addEventListener('click', runDRC);
}

// ════════════════════════════════════════════════════════════════════════════
// 4. Canvas event handlers
// ════════════════════════════════════════════════════════════════════════════

function bindCanvasEvents() {
  const canvas = document.getElementById('main-canvas');

  canvas.addEventListener('mousemove', e => {
    const { x, y } = _mouseToGrid(e);
    if (renderer.inBounds(x, y)) {
      state.hoveredCell = { x, y };
      if (state.drawing) {
        // Update the constrained preview endpoint as the mouse moves
        state.previewEnd = _constrainEndpoint(x, y);
      }
    } else {
      state.hoveredCell = null;
      state.previewEnd  = null;
    }
    updateCursorInfo();
    renderer.render(state);
  });

  canvas.addEventListener('mouseleave', () => {
    state.hoveredCell = null;
    state.previewEnd  = null;
    renderer.render(state);
  });

  canvas.addEventListener('click', e => {
    const { x, y } = _mouseToGrid(e);
    if (!renderer.inBounds(x, y)) return;
    handleCellClick(x, y);
  });
}

/** Dispatch a grid-cell click to the active tool. */
function handleCellClick(x, y) {
  if (state.currentTool === 'wire')   handleWireClick(x, y);
  if (state.currentTool === 'via')    addVia(x, y);
  if (state.currentTool === 'delete') deleteAt(x, y);
}

/**
 * Wire-draw state machine.
 *   First click  → records the start point.
 *   Second click → places the wire (constrained to layer direction).
 */
function handleWireClick(x, y) {
  if (!state.drawing) {
    // ── Start of wire ──────────────────────────────────────────────────────
    state.drawing    = { startX: x, startY: y };
    state.previewEnd = { x, y };
    updateHint('Click again to place the wire end.  Press Esc to cancel.');
    _recordEvent({ type: 'wire_start', layer: state.currentLayerId,
                   net: state.currentNetName, x, y });
  } else {
    // ── End of wire ────────────────────────────────────────────────────────
    const end = _constrainEndpoint(x, y);
    addWire(state.drawing.startX, state.drawing.startY, end.x, end.y);
    state.drawing    = null;
    state.previewEnd = null;
    updateHint('Click to start a new wire.');
  }
}

// Allow pressing Escape to cancel a wire in progress
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.drawing) {
    state.drawing    = null;
    state.previewEnd = null;
    updateHint('Wire cancelled.  Click to start a new wire.');
    renderer.render(state);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 5. Tool actions
// ════════════════════════════════════════════════════════════════════════════

/** Add a wire segment on the current layer. */
function addWire(x1, y1, x2, y2) {
  if (x1 === x2 && y1 === y2) return; // ignore zero-length taps

  _pushHistory();
  state.layout.layers[state.currentLayerId].wires.push({
    net: state.currentNetName,
    x1, y1, x2, y2,
  });

  _recordEvent({ type: 'wire_draw', layer: state.currentLayerId,
                 net: state.currentNetName, x1, y1, x2, y2 });
  renderer.render(state);
}

/**
 * Place a via at (x, y) on the current layer.
 *
 * The via connects the current layer to the layer directly above it
 * (currentLayerId + 1).  If the current layer is already the topmost
 * layer it connects downward instead (currentLayerId − 1).
 *
 * Vias are stored in the lower-numbered layer's vias array so that
 * the canvas and backend can find them consistently.
 */
function addVia(x, y) {
  const numLayers = state.layout.layers.length;
  const fromLayer = state.currentLayerId;
  // Go up one layer; fall back to going down if already at the top
  const toLayer   = fromLayer < numLayers - 1 ? fromLayer + 1 : fromLayer - 1;

  if (fromLayer === toLayer) return; // only one layer — nothing to connect

  _pushHistory();

  const storageLayerId = Math.min(fromLayer, toLayer);
  state.layout.layers[storageLayerId].vias.push({
    net:        state.currentNetName,
    x, y,
    from_layer: fromLayer,
    to_layer:   toLayer,
  });

  _recordEvent({ type: 'via_place', from_layer: fromLayer, to_layer: toLayer,
                 net: state.currentNetName, x, y });
  renderer.render(state);
}

/**
 * Delete any wire or via that overlaps the clicked cell (x, y) on the
 * current layer.
 */
function deleteAt(x, y) {
  const layer        = state.layout.layers[state.currentLayerId];
  const wiresBefore  = layer.wires.length;
  let   viasBefore   = 0;
  state.layout.layers.forEach(l => { viasBefore += l.vias.length; });

  _pushHistory();

  // Remove wires passing through (x, y)
  layer.wires = layer.wires.filter(w => !_wirePassesThrough(w, x, y));

  // Remove vias at (x, y) that are connected to the current layer
  for (const l of state.layout.layers) {
    l.vias = l.vias.filter(v => {
      const touchesCurrent =
        v.from_layer === state.currentLayerId ||
        v.to_layer   === state.currentLayerId;
      return !(touchesCurrent && v.x === x && v.y === y);
    });
  }

  let viasAfter = 0;
  state.layout.layers.forEach(l => { viasAfter += l.vias.length; });

  const deleted = (wiresBefore - layer.wires.length) + (viasBefore - viasAfter);
  if (deleted === 0) {
    state.history.pop(); // nothing changed — discard the snapshot we just pushed
    return;
  }

  _recordEvent({ type: 'delete', layer: state.currentLayerId, x, y });
  renderer.render(state);
}

/** Revert the layout to the previous state. */
function undo() {
  if (state.history.length === 0) return;
  state.layout     = JSON.parse(state.history.pop());
  state.drawing    = null;
  state.previewEnd = null;
  _recordEvent({ type: 'undo' });
  renderer.render(state);
  updateHint('Undo applied.');
}

// ════════════════════════════════════════════════════════════════════════════
// 6. Backend actions
// ════════════════════════════════════════════════════════════════════════════

/** Create a new backend session (clears the canvas). */
async function startNewSession() {
  try {
    const config            = { grid: CONFIG.grid, nets: CONFIG.nets.map(n => n.name) };
    const { session_id }    = await api.newSession(config);
    state.sessionId         = session_id;
    state.history           = [];
    state.drcResult         = null;
    initLayout();
    renderer.render(state);
    updateSessionLabel();
    updateDrcPanel();
    updateSessionsList();
    updateHint('New session started.  Select a tool and begin routing.');
  } catch (err) {
    showError('Could not create session: ' + err.message);
  }
}

/** Persist the current layout to the backend. */
async function saveSession() {
  if (!state.sessionId) return showError('Start a session first.');
  try {
    await api.saveLayout(state.sessionId, state.layout);
    updateHint('Layout saved ✓');
  } catch (err) {
    showError('Save failed: ' + err.message);
  }
}

/** Fetch and download the full session JSON (layout + trajectory). */
async function exportSession() {
  if (!state.sessionId) return showError('Start a session first.');
  try {
    const data = await api.exportSession(state.sessionId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `session_${state.sessionId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showError('Export failed: ' + err.message);
  }
}

/** Auto-route just the currently selected net. */
async function autoRouteCurrentNet() {
  await _autoRouteNet(state.currentNetName);
}

/** Auto-route every net defined in CONFIG one by one. */
async function autoRouteAll() {
  for (const net of CONFIG.nets) {
    await _autoRouteNet(net.name);
  }
}

async function _autoRouteNet(netName) {
  try {
    updateHint(`Auto-routing ${netName}…`);
    const result = await api.autoRoute(state.layout, netName);

    if (result.status === 'error') {
      return showError(`Auto-route failed for "${netName}": ${result.message}`);
    }

    _pushHistory();

    // Apply returned wires to their respective layers
    for (const wire of result.wires) {
      if (wire.layer !== undefined) {
        state.layout.layers[wire.layer].wires.push(wire);
      }
    }

    // Apply returned vias to the lower-numbered layer's vias array
    for (const via of result.vias) {
      const storageLayerId = Math.min(via.from_layer, via.to_layer);
      state.layout.layers[storageLayerId].vias.push(via);
    }

    _recordEvent({ type: 'autoroute', net: netName, status: result.status });
    renderer.render(state);
    updateHint(`"${netName}" routed (${result.status}).`);
  } catch (err) {
    showError('Auto-route error: ' + err.message);
  }
}

/** Run DRC on the current layout and display results. */
async function runDRC() {
  try {
    updateHint('Running DRC…');
    const result    = await api.runDRC(state.layout);
    state.drcResult = result;
    updateDrcPanel();
    renderer.render(state);

    if (state.sessionId) {
      // Save the DRC score into the session
      const layoutWithScore = { ...state.layout, drc_score: result.score };
      await api.saveLayout(state.sessionId, layoutWithScore);
      _recordEvent({ type: 'drc', score: result.score,
                     total_violations: result.total_violations });
    }

    updateHint(`DRC complete — score ${result.score}/100  (${result.total_violations} violation(s)).`);
    updateSessionsList();
  } catch (err) {
    showError('DRC error: ' + err.message);
  }
}

/** Fire-and-forget: send one event to the backend trajectory recorder. */
async function _recordEvent(event) {
  if (!state.sessionId) return;
  try {
    await api.recordEvent(state.sessionId, event);
  } catch (_) {
    // Non-critical — do not distract the user with an alert
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 7. UI updaters
// ════════════════════════════════════════════════════════════════════════════

/** Switch the active layer and update all related UI elements. */
function setLayer(layerId) {
  state.currentLayerId = layerId;
  state.drawing        = null;
  state.previewEnd     = null;

  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.classList.toggle('active', +btn.dataset.layerId === layerId);
  });

  const layer = state.layout.layers[layerId];
  document.getElementById('info-layer').textContent =
    `Layer: ${layer.name} (${layer.direction})`;

  _recordEvent({ type: 'layer_switch', to_layer: layerId });
  renderer.render(state);
  updateHint('Click to start a wire on this layer.');
}

/** Switch the active tool and update button highlight + cursor style. */
function setTool(toolName) {
  state.currentTool = toolName;
  state.drawing     = null;
  state.previewEnd  = null;

  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === toolName);
  });

  const canvas = document.getElementById('main-canvas');
  canvas.className = `tool-${toolName}`;

  const hints = {
    wire:   'Click to start a wire — click again to place its end.',
    via:    'Click a cell to place a via connecting this layer to the next one.',
    delete: 'Click on a wire or via to remove it.',
  };
  updateHint(hints[toolName] || '');
  renderer.render(state);
}

/** Update the small colour swatch next to the net selector. */
function updateNetSwatch() {
  const net = CONFIG.nets.find(n => n.name === state.currentNetName);
  document.getElementById('net-color-swatch').style.background =
    net ? net.color : '#ffffff';
}

/** Show the current session UUID (truncated) in the top bar. */
function updateSessionLabel() {
  const el        = document.getElementById('session-label');
  el.textContent  = state.sessionId
    ? `Session: ${state.sessionId.slice(0, 8)}…`
    : 'Session: —';
}

/** Keep the cursor-position display in sync with mouse movement. */
function updateCursorInfo() {
  const el       = document.getElementById('info-cursor');
  el.textContent = state.hoveredCell
    ? `Cursor: (${state.hoveredCell.x}, ${state.hoveredCell.y})`
    : 'Cursor: —';
}

/** Update the single-line hint bar below the canvas. */
function updateHint(msg) {
  const el       = document.getElementById('info-hint');
  el.textContent = msg;
  el.style.color = '';
}

/** Show a temporary error message in the hint bar. */
function showError(msg) {
  const el       = document.getElementById('info-hint');
  el.textContent = '⚠ ' + msg;
  el.style.color = '#ef4444';
  setTimeout(() => { el.style.color = ''; }, 5000);
}

/** Render the DRC score and violations list in the right panel. */
function updateDrcPanel() {
  const scoreEl = document.getElementById('drc-score');
  const violEl  = document.getElementById('drc-violations');

  if (!state.drcResult) {
    scoreEl.textContent = '—';
    scoreEl.className   = '';
    violEl.innerHTML    = '<p class="dim">Run DRC to see results.</p>';
    return;
  }

  const score         = state.drcResult.score;
  scoreEl.textContent = score + '/100';
  scoreEl.className   = score >= 80 ? 'score-good' : score >= 50 ? 'score-ok' : 'score-bad';

  if (state.drcResult.violations.length === 0) {
    violEl.innerHTML = '<p class="ok">✓ No violations — perfect layout!</p>';
    return;
  }

  violEl.innerHTML = state.drcResult.violations.map(v => `
    <div class="violation-item ${v.severity === 'warning' ? 'warning' : ''}">
      <span class="violation-rule">${v.rule}</span>
      <span class="violation-sev">[${v.severity}]</span><br>
      ${v.message}
    </div>
  `).join('');
}

/** Fetch past sessions from the backend and render them in the right panel. */
async function updateSessionsList() {
  const container = document.getElementById('sessions-list');
  try {
    const sessions = await api.listSessions();
    if (sessions.length === 0) {
      container.innerHTML = '<p class="dim">No sessions yet.</p>';
      return;
    }
    container.innerHTML = sessions.slice(0, 15).map(s => `
      <div class="session-item" title="${s.session_id}">
        <span class="session-id">${s.session_id.slice(0, 14)}…</span>
        ${s.drc_score !== null
          ? `<span class="session-score">${s.drc_score}</span>`
          : ''}
        <br>
        <small>${new Date(s.created_at).toLocaleString()}</small>
      </div>
    `).join('');
  } catch (_) {
    container.innerHTML = '<p class="dim">Cannot reach backend.</p>';
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 8. Internal helpers
// ════════════════════════════════════════════════════════════════════════════

/**
 * Save a deep copy of the current layout to the undo stack.
 * Keeps at most 30 snapshots to limit memory use.
 */
function _pushHistory() {
  state.history.push(JSON.stringify(state.layout));
  if (state.history.length > 30) state.history.shift();
}

/**
 * Snap the cursor endpoint to the current layer's allowed routing direction.
 *   Horizontal layer → force y to match the wire start row.
 *   Vertical layer   → force x to match the wire start column.
 *
 * @returns {{ x: number, y: number }}
 */
function _constrainEndpoint(x, y) {
  if (!state.drawing) return { x, y };
  const direction = state.layout.layers[state.currentLayerId].direction;
  if (direction === 'horizontal') return { x, y: state.drawing.startY };
  return { x: state.drawing.startX, y };
}

/**
 * Convert a MouseEvent on the canvas to grid coordinates, taking into
 * account any CSS scaling (e.g. if the canvas is displayed smaller).
 *
 * @returns {{ x: number, y: number }}
 */
function _mouseToGrid(event) {
  const rect   = renderer.canvas.getBoundingClientRect();
  const scaleX = renderer.canvas.width  / rect.width;
  const scaleY = renderer.canvas.height / rect.height;
  const px     = (event.clientX - rect.left) * scaleX;
  const py     = (event.clientY - rect.top)  * scaleY;
  return renderer.pixelToGrid(px, py);
}

/**
 * Return true if the wire segment `w` passes through grid cell (x, y).
 * Used by deleteAt() to decide which wires to remove.
 */
function _wirePassesThrough(w, x, y) {
  if (w.x1 === w.x2) {
    // Vertical segment
    return w.x1 === x && y >= Math.min(w.y1, w.y2) && y <= Math.max(w.y1, w.y2);
  }
  // Horizontal segment
  return w.y1 === y && x >= Math.min(w.x1, w.x2) && x <= Math.max(w.x1, w.x2);
}

// ════════════════════════════════════════════════════════════════════════════
// 9. Bootstrap — runs once when the HTML page is fully loaded
// ════════════════════════════════════════════════════════════════════════════

/** Global CanvasRenderer instance, created during bootstrap. */
let renderer;

window.addEventListener('DOMContentLoaded', async () => {
  // 1. Build the layout data structure from CONFIG
  initLayout();

  // 2. Create the canvas renderer (must happen before any render calls)
  renderer = new CanvasRenderer(document.getElementById('main-canvas'), CONFIG);

  // 3. Populate and wire up UI controls
  buildLayerButtons();
  buildNetSelector();
  bindButtons();
  bindCanvasEvents();

  // 4. Set initial UI state
  updateNetSwatch();
  updateCursorInfo();
  updateHint('Creating session…');

  // 5. Try to create a session automatically; fall back gracefully
  try {
    await startNewSession();
  } catch (_) {
    updateHint('Backend not available — routing locally without recording.');
  }

  // 6. Initial render
  renderer.render(state);
});
