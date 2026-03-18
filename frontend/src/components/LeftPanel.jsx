/**
 * components/LeftPanel.jsx
 * =========================
 * Layer selector, net selector, drawing tools, auto-route, and DRC.
 */

import React from 'react';
import { CONFIG } from '../config/defaults.js';

export default function LeftPanel({
  activeLayer,
  activeNet,
  activeTool,
  drcScore,
  onLayerChange,
  onNetChange,
  onToolChange,
  onUndo,
  onAutorouteNet,
  onAutorouteAll,
  onRunDRC,
  canUndo,
}) {
  const activeNetMeta = CONFIG.nets.find(n => n.name === activeNet);

  return (
    <aside className="panel-left">

      {/* ── Layers ──────────────────────────────────── */}
      <section className="panel-section">
        <h2>Layers</h2>
        <div className="layer-buttons">
          {CONFIG.layers.map(layer => (
            <button
              key={layer.id}
              className={`layer-btn ${activeLayer === layer.id ? 'active' : ''}`}
              style={{ borderColor: layer.color, color: activeLayer === layer.id ? layer.color : undefined }}
              onClick={() => onLayerChange(layer.id)}
            >
              {layer.name}
              <small style={{ display: 'block', fontSize: '0.65em', opacity: 0.7 }}>
                {layer.direction}
              </small>
            </button>
          ))}
        </div>
      </section>

      {/* ── Active net ──────────────────────────────── */}
      <section className="panel-section">
        <h2>Active Net</h2>
        <select value={activeNet} onChange={e => onNetChange(e.target.value)}>
          {CONFIG.nets.map(net => (
            <option key={net.name} value={net.name}>{net.name}</option>
          ))}
        </select>
        <div
          className="net-color-swatch"
          style={{ background: activeNetMeta?.color ?? '#888' }}
        />
      </section>

      {/* ── Drawing tools ───────────────────────────── */}
      <section className="panel-section">
        <h2>Tools</h2>
        <div className="tool-buttons">
          {['wire', 'via', 'delete'].map(tool => (
            <button
              key={tool}
              className={`tool-btn ${activeTool === tool ? 'active' : ''}`}
              onClick={() => onToolChange(tool)}
            >
              {tool === 'wire' ? '🖊 Wire' : tool === 'via' ? '⬡ Via' : '✕ Delete'}
            </button>
          ))}
        </div>
        <button className="action-btn" onClick={onUndo} disabled={!canUndo}>
          ↩ Undo
        </button>
      </section>

      {/* ── Auto-route ──────────────────────────────── */}
      <section className="panel-section">
        <h2>Auto-Route</h2>
        <button className="action-btn" onClick={onAutorouteNet}>
          ▶ Route Active Net
        </button>
        <button className="action-btn" onClick={onAutorouteAll}>
          ▶▶ Route All Nets
        </button>
      </section>

      {/* ── DRC ─────────────────────────────────────── */}
      <section className="panel-section">
        <h2>Design Rule Check</h2>
        <button className="action-btn" onClick={onRunDRC}>
          ▶ Run DRC
        </button>
        {drcScore !== null && drcScore !== undefined && (
          <div className="drc-score">
            Score: {drcScore.toFixed(0)} / 100
          </div>
        )}
      </section>

    </aside>
  );
}
