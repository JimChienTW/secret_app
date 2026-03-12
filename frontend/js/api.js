/**
 * api.js
 * ======
 * Thin wrapper functions for every Flask backend endpoint.
 *
 * All functions are async and return the parsed JSON response.
 * The base URL is taken from CONFIG.apiBase (set in config.js).
 *
 * You should not need to edit this file unless you add new backend
 * endpoints in app.py.
 */

const api = (() => {

  // ── Low-level helpers ────────────────────────────────────────────────────

  async function _post(path, body) {
    const resp = await fetch(CONFIG.apiBase + path, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`POST ${path} → ${resp.status}: ${text}`);
    }
    return resp.json();
  }

  async function _get(path) {
    const resp = await fetch(CONFIG.apiBase + path);
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`GET ${path} → ${resp.status}: ${text}`);
    }
    return resp.json();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  return {
    /**
     * Create a new recording session on the backend.
     * @returns {{ session_id: string }}
     */
    newSession(config) {
      return _post('/api/session/new', { config });
    },

    /**
     * Append one interaction event to a session's trajectory.
     * @param {string} sessionId
     * @param {object} event  — must have a 'type' string field
     */
    recordEvent(sessionId, event) {
      return _post(`/api/session/${sessionId}/record`, event);
    },

    /**
     * Persist the current layout snapshot for a session.
     * @param {string} sessionId
     * @param {object} layout   — full layout object
     */
    saveLayout(sessionId, layout) {
      return _post(`/api/session/${sessionId}/save`, layout);
    },

    /**
     * Download a full session (layout + trajectory) as JSON.
     * @returns {object}  Complete session data including trajectory array.
     */
    exportSession(sessionId) {
      return _get(`/api/session/${sessionId}/export`);
    },

    /** List all past sessions (summary — id, date, DRC score). */
    listSessions() {
      return _get('/api/sessions');
    },

    /**
     * Ask the backend auto-router to route one net through the layout.
     * @param {object} layout   — current full layout
     * @param {string} netName  — name of the net to route
     * @returns {{ status, wires, vias, net }}
     */
    autoRoute(layout, netName) {
      return _post('/api/autoroute', { layout, net: netName });
    },

    /**
     * Run the Design Rule Checker on the current layout.
     * @param {object} layout
     * @returns {{ score, violations, total_violations }}
     */
    runDRC(layout) {
      return _post('/api/drc', { layout });
    },
  };
})();
