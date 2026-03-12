"""
database.py — SQLite persistence for sessions and interaction trajectories.
"""
import sqlite3
import json
import uuid
import os
from datetime import datetime, timezone


class Database:
    """Manages session data and interaction trajectories in SQLite."""

    def __init__(self, db_path: str):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.db_path = db_path
        self._init_db()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id          TEXT PRIMARY KEY,
                    created_at  TEXT NOT NULL,
                    config      TEXT,
                    final_layout TEXT,
                    drc_score   REAL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id  TEXT NOT NULL,
                    timestamp   TEXT NOT NULL,
                    event_type  TEXT NOT NULL,
                    data        TEXT,
                    FOREIGN KEY (session_id) REFERENCES sessions(id)
                )
            """)
            conn.commit()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def create_session(self, config: dict | None = None) -> str:
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO sessions (id, created_at, config) VALUES (?, ?, ?)",
                (session_id, now, json.dumps(config or {})),
            )
            conn.commit()
        return session_id

    def record_event(self, session_id: str, event: dict):
        now = datetime.now(timezone.utc).isoformat()
        event_type = event.get("type", "unknown")
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO events (session_id, timestamp, event_type, data) VALUES (?, ?, ?, ?)",
                (session_id, now, event_type, json.dumps(event)),
            )
            conn.commit()

    def save_layout(self, session_id: str, layout: dict):
        drc_score = layout.get("drc_score")
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE sessions SET final_layout = ?, drc_score = ? WHERE id = ?",
                (json.dumps(layout), drc_score, session_id),
            )
            conn.commit()

    def export_session(self, session_id: str) -> dict | None:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
            if not row:
                return None

            session = {
                "session_id": row["id"],
                "created_at": row["created_at"],
                "config": json.loads(row["config"]) if row["config"] else {},
                "final_layout": json.loads(row["final_layout"]) if row["final_layout"] else None,
                "drc_score": row["drc_score"],
            }

            events = conn.execute(
                "SELECT timestamp, event_type, data FROM events "
                "WHERE session_id = ? ORDER BY id",
                (session_id,),
            ).fetchall()
            session["trajectory"] = [
                {"timestamp": e["timestamp"], "type": e["event_type"], **json.loads(e["data"])}
                for e in events
            ]
            return session

    def list_sessions(self) -> list[dict]:
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT id, created_at, drc_score FROM sessions ORDER BY created_at DESC"
            ).fetchall()
            return [
                {"session_id": r["id"], "created_at": r["created_at"], "drc_score": r["drc_score"]}
                for r in rows
            ]
