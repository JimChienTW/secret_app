/**
 * App.jsx — Root component.
 *
 * Owns the top-level state and wires together all panels and hooks.
 * All heavy computation (DRC, routing) happens in the FastAPI backend
 * (offloaded to a thread pool there); the frontend stays responsive.
 */

import React, { useCallback, useState } from 'react';
import TopBar    from './components/TopBar.jsx';
import LeftPanel from './components/LeftPanel.jsx';
import RightPanel from './components/RightPanel.jsx';
import ICCanvas  from './components/canvas/ICCanvas.jsx';
import { CONFIG } from './config/defaults.js';
import { useLayout }  from './hooks/useLayout.js';
import { useSession } from './hooks/useSession.js';
import * as api from './api/client.js';

export default function App() {
  // ── Layout state (local, no server lag) ──────────────────────────────
  const {
    layout,
    waypoints,
    addWire,
    addVia,
    deleteAt,
    undo,
    applyAutoroute,
    applyDRC,
    resetLayout,
    canUndo,
  } = useLayout();

  // ── Session state ─────────────────────────────────────────────────────
  const {
    sessionId,
    sessions,
    saving,
    error: sessionError,
    saveLayout,
    exportSession,
    newSession,
  } = useSession();

  // ── UI state ──────────────────────────────────────────────────────────
  const [activeLayer, setActiveLayer] = useState(0);
  const [activeNet,   setActiveNet]   = useState(CONFIG.nets[0]?.name ?? 'VDD');
  const [activeTool,  setActiveTool]  = useState('wire');
  const [violations,  setViolations]  = useState([]);
  const [appError,    setAppError]    = useState(null);

  const drcScore = layout.drc_score ?? null;

  // ── Helpers ───────────────────────────────────────────────────────────

  const handleError = useCallback((msg) => {
    setAppError(msg);
    setTimeout(() => setAppError(null), 5000);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    await saveLayout({ ...layout, trajectory: waypoints });
  }, [saveLayout, layout, waypoints]);

  const handleNewSession = useCallback(async () => {
    resetLayout();
    setViolations([]);
    await newSession({ config: CONFIG });
  }, [resetLayout, newSession]);

  const handleAutorouteNet = useCallback(async () => {
    try {
      const result = await api.autoroute(layout, activeNet);
      if (result.status === 'success' || result.status === 'partial') {
        applyAutoroute(result.net, result.wires ?? [], result.vias ?? []);
      } else {
        handleError(result.message ?? 'Routing failed');
      }
    } catch (err) {
      handleError(err.message);
    }
  }, [layout, activeNet, applyAutoroute, handleError]);

  const handleAutorouteAll = useCallback(async () => {
    for (const net of CONFIG.nets) {
      try {
        const result = await api.autoroute(layout, net.name);
        if (result.status === 'success' || result.status === 'partial') {
          applyAutoroute(result.net, result.wires ?? [], result.vias ?? []);
        }
      } catch {
        // continue with remaining nets
      }
    }
  }, [layout, applyAutoroute]);

  const handleRunDRC = useCallback(async () => {
    try {
      const result = await api.runDRC(layout);
      setViolations(result.violations ?? []);
      applyDRC(result.score, result.total_violations);
    } catch (err) {
      handleError(err.message);
    }
  }, [layout, applyDRC, handleError]);

  // ── Active layer metadata ─────────────────────────────────────────────
  const activeLayerMeta = CONFIG.layers.find(l => l.id === activeLayer);
  const direction = activeLayerMeta?.direction ?? 'horizontal';

  return (
    <div className="app">
      <TopBar
        sessionId={sessionId}
        saving={saving}
        onSave={handleSave}
        onExport={exportSession}
        onNewSession={handleNewSession}
      />

      <div className="content">
        <LeftPanel
          activeLayer={activeLayer}
          activeNet={activeNet}
          activeTool={activeTool}
          drcScore={drcScore}
          onLayerChange={setActiveLayer}
          onNetChange={setActiveNet}
          onToolChange={setActiveTool}
          onUndo={undo}
          onAutorouteNet={handleAutorouteNet}
          onAutorouteAll={handleAutorouteAll}
          onRunDRC={handleRunDRC}
          canUndo={canUndo}
        />

        <main className="canvas-area">
          {(appError || sessionError) && (
            <div className="error-banner">⚠ {appError || sessionError}</div>
          )}
          <div className="canvas-info">
            <span>Layer: {activeLayerMeta?.name ?? '?'} ({direction})</span>
            <span>Net: {activeNet}</span>
            <span>Tool: {activeTool}</span>
          </div>
          <ICCanvas
            layout={layout}
            activeTool={activeTool}
            activeLayer={activeLayer}
            activeNet={activeNet}
            onAddWire={addWire}
            onAddVia={addVia}
            onDelete={deleteAt}
          />
        </main>

        <RightPanel violations={violations} sessions={sessions} />
      </div>
    </div>
  );
}
