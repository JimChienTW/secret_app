/**
 * api/client.js
 * =============
 * Thin wrappers around every FastAPI endpoint.
 *
 * All functions return the parsed JSON response.  Errors are thrown as
 * plain Error objects with the server's detail message.
 */

import { CONFIG } from '../config/defaults.js';

const base = CONFIG.apiBase;

async function _post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail ?? JSON.stringify(json));
  return json;
}

async function _get(path) {
  const res = await fetch(`${base}${path}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail ?? JSON.stringify(json));
  return json;
}

// ── Session management ────────────────────────────────────────────────────

/** Create a new labeling session; returns { session_id }. */
export const newSession = (config = {}) =>
  _post('/api/session/new', { config });

/**
 * Append one trajectory event to the session.
 *
 * The server validates the event through a Pydantic discriminated union —
 * malformed events are rejected with a 422 before reaching the database.
 */
export const recordEvent = (sessionId, event) =>
  _post(`/api/session/${sessionId}/record`, { event });

/** Persist the final layout snapshot. */
export const saveLayout = (sessionId, layout) =>
  _post(`/api/session/${sessionId}/save`, { layout });

/** Download the full session document (layout + trajectory). */
export const exportSession = (sessionId) =>
  _get(`/api/session/${sessionId}/export`);

/** List all sessions (summary only). */
export const listSessions = () => _get('/api/sessions');

// ── Routing / DRC ─────────────────────────────────────────────────────────

/** Ask the router to connect all pins of *net* in *layout*. */
export const autoroute = (layout, net) =>
  _post('/api/autoroute', { layout, net });

/** Run the Design Rule Checker on *layout*. */
export const runDRC = (layout) =>
  _post('/api/drc', { layout });
