/**
 * hooks/useLayout.js
 * ==================
 * Manages the entire routing layout state and the local waypoint history.
 *
 * Waypoints are stored in memory so every draw action is reflected
 * immediately on the canvas without a server round-trip.  The full
 * trajectory is only sent to the backend when the user explicitly saves
 * or exports the session.
 */

import { useCallback, useState } from 'react';
import { buildInitialLayout } from '../config/defaults.js';

const MAX_UNDO = 50;

export function useLayout() {
  const [layout, setLayout]     = useState(buildInitialLayout);
  const [waypoints, setWaypoints] = useState([]);   // local trajectory buffer
  const [history, setHistory]   = useState([]);     // undo stack (layout snapshots)

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Push current layout onto the undo stack before mutating. */
  const _snapshot = useCallback((currentLayout) => {
    setHistory(h => [...h.slice(-(MAX_UNDO - 1)), JSON.parse(JSON.stringify(currentLayout))]);
  }, []);

  /** Append a typed event to the local waypoint buffer. */
  const _pushWaypoint = useCallback((event) => {
    const ts = new Date().toISOString();
    setWaypoints(w => [...w, { timestamp: ts, ...event }]);
  }, []);

  // ── Public actions ─────────────────────────────────────────────────────

  /** Draw a wire segment on the given layer for the given net. */
  const addWire = useCallback((layerId, net, x1, y1, x2, y2) => {
    setLayout(prev => {
      _snapshot(prev);
      const layers = prev.layers.map(l =>
        l.id === layerId
          ? { ...l, wires: [...l.wires, { net, layer: layerId, x1, y1, x2, y2 }] }
          : l
      );
      return { ...prev, layers };
    });
    _pushWaypoint({ type: 'wire_draw', layer: layerId, net, x1, y1, x2, y2 });
  }, [_snapshot, _pushWaypoint]);

  /** Place a via connecting fromLayer → toLayer at (x, y). */
  const addVia = useCallback((net, x, y, fromLayer, toLayer) => {
    setLayout(prev => {
      _snapshot(prev);
      const layers = prev.layers.map(l =>
        l.id === fromLayer
          ? { ...l, vias: [...l.vias, { net, x, y, from_layer: fromLayer, to_layer: toLayer }] }
          : l
      );
      return { ...prev, layers };
    });
    _pushWaypoint({ type: 'via_place', from_layer: fromLayer, to_layer: toLayer, x, y });
  }, [_snapshot, _pushWaypoint]);

  /** Remove the wire or via closest to (x, y) on layerId. */
  const deleteAt = useCallback((layerId, x, y) => {
    setLayout(prev => {
      _snapshot(prev);
      const layers = prev.layers.map(l => {
        if (l.id !== layerId) return l;
        // Try to remove a via first
        const filteredVias = l.vias.filter(v => !(v.x === x && v.y === y));
        if (filteredVias.length < l.vias.length) {
          return { ...l, vias: filteredVias };
        }
        // Then try a wire that covers (x, y)
        const filteredWires = l.wires.filter(w => {
          if (w.x1 === w.x2) {
            return !(w.x1 === x && y >= Math.min(w.y1, w.y2) && y <= Math.max(w.y1, w.y2));
          }
          return !(w.y1 === y && x >= Math.min(w.x1, w.x2) && x <= Math.max(w.x1, w.x2));
        });
        return { ...l, wires: filteredWires };
      });
      return { ...prev, layers };
    });
    _pushWaypoint({ type: 'delete', layer: layerId, x, y });
  }, [_snapshot, _pushWaypoint]);

  /** Revert the last action. */
  const undo = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setLayout(prev);
      _pushWaypoint({ type: 'undo' });
      return h.slice(0, -1);
    });
  }, [_pushWaypoint]);

  /**
   * Apply autoroute result: merge new wires/vias for the given net into
   * the layout, replacing any previously routed wires/vias for that net.
   */
  const applyAutoroute = useCallback((net, wires, vias) => {
    setLayout(prev => {
      _snapshot(prev);
      const layers = prev.layers.map(l => ({
        ...l,
        wires: [
          ...l.wires.filter(w => w.net !== net),
          ...wires.filter(w => w.layer === l.id),
        ],
        vias: [
          ...l.vias.filter(v => v.net !== net),
          ...vias.filter(v => v.from_layer === l.id),
        ],
      }));
      return { ...prev, layers };
    });
    _pushWaypoint({ type: 'autoroute', net });
  }, [_snapshot, _pushWaypoint]);

  /** Merge DRC score into the layout and record the event. */
  const applyDRC = useCallback((score, totalViolations) => {
    setLayout(prev => ({ ...prev, drc_score: score }));
    _pushWaypoint({ type: 'drc', score, total_violations: totalViolations });
  }, [_pushWaypoint]);

  /** Reset to a fresh layout (used when loading a new task). */
  const resetLayout = useCallback(() => {
    setLayout(buildInitialLayout());
    setWaypoints([]);
    setHistory([]);
  }, []);

  return {
    layout,
    waypoints,
    addWire,
    addVia,
    deleteAt,
    undo,
    applyAutoroute,
    applyDRC,
    resetLayout,
    canUndo: history.length > 0,
  };
}
