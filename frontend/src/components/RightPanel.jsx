/**
 * components/RightPanel.jsx
 * ==========================
 * DRC violation list and past sessions summary.
 */

import React from 'react';

function ViolationItem({ v }) {
  const badge = v.severity === 'error' ? '🔴' : '🟡';
  return (
    <div className="violation-item">
      <span>{badge} <strong>{v.rule}</strong></span>
      <p>{v.message}</p>
    </div>
  );
}

function SessionItem({ session, onLoad }) {
  const date = new Date(session.created_at).toLocaleString();
  const score = session.drc_score !== null && session.drc_score !== undefined
    ? `Score: ${session.drc_score.toFixed(0)}`
    : 'No score';
  return (
    <div className="session-item">
      <span title={session.session_id}>{session.session_id.slice(0, 8)}…</span>
      <small>{date}</small>
      <small>{score}</small>
    </div>
  );
}

export default function RightPanel({ violations, sessions }) {
  return (
    <aside className="panel-right">

      {/* ── DRC Violations ──────────────────────────── */}
      <section className="panel-section">
        <h2>DRC Violations</h2>
        <div className="drc-violations">
          {violations.length === 0 ? (
            <p className="dim">Run DRC to see results.</p>
          ) : (
            violations.map((v, i) => <ViolationItem key={i} v={v} />)
          )}
        </div>
      </section>

      {/* ── Past sessions ───────────────────────────── */}
      <section className="panel-section">
        <h2>Past Sessions</h2>
        <div className="sessions-list">
          {sessions.length === 0 ? (
            <p className="dim">No sessions yet.</p>
          ) : (
            sessions.map(s => <SessionItem key={s.session_id} session={s} />)
          )}
        </div>
      </section>

    </aside>
  );
}
