/**
 * hooks/useSession.js
 * ===================
 * Manages the lifecycle of a labeling session:
 *   create → record events → save/export → list past sessions
 */

import { useCallback, useEffect, useState } from 'react';
import * as api from '../api/client.js';

export function useSession() {
  const [sessionId, setSessionId]   = useState(null);
  const [sessions,  setSessions]    = useState([]);
  const [saving,    setSaving]      = useState(false);
  const [error,     setError]       = useState(null);

  // ── Bootstrap: create a session on mount ──────────────────────────────

  const createSession = useCallback(async (config = {}) => {
    try {
      const data = await api.newSession(config);
      setSessionId(data.session_id);
      return data.session_id;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    createSession();
    fetchSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Session list ───────────────────────────────────────────────────────

  const fetchSessions = useCallback(async () => {
    try {
      const data = await api.listSessions();
      setSessions(data);
    } catch {
      // Non-fatal — list may just be empty on first run
    }
  }, []);

  // ── Save / Export ──────────────────────────────────────────────────────

  const saveLayout = useCallback(async (layout) => {
    if (!sessionId) return;
    setSaving(true);
    try {
      await api.saveLayout(sessionId, layout);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [sessionId]);

  const exportSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await api.exportSession(sessionId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `session-${sessionId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }, [sessionId]);

  const newSession = useCallback(async (config = {}) => {
    const id = await createSession(config);
    await fetchSessions();
    return id;
  }, [createSession, fetchSessions]);

  return {
    sessionId,
    sessions,
    saving,
    error,
    saveLayout,
    exportSession,
    newSession,
    fetchSessions,
  };
}
