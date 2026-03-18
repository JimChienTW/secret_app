/**
 * components/TopBar.jsx
 * ======================
 * Application header: title, current session label, and action buttons.
 */

import React from 'react';

export default function TopBar({ sessionId, saving, onSave, onExport, onNewSession }) {
  return (
    <header className="topbar">
      <h1>🔬 3D IC Layout Tool</h1>
      <span className="session-label">
        Session: {sessionId ? sessionId.slice(0, 8) + '…' : '—'}
      </span>
      <div className="topbar-actions">
        <button onClick={onSave} disabled={saving || !sessionId}>
          {saving ? '…' : '💾'} Save
        </button>
        <button onClick={onExport} disabled={!sessionId}>
          📦 Export JSON
        </button>
        <button onClick={onNewSession}>
          🆕 New Session
        </button>
      </div>
    </header>
  );
}
