"""
mongo_database.py — Async MongoDB persistence layer using Motor.

Collections
-----------
sessions     : one document per labeling session
  {
      _id          : str  (UUID, used as session_id)
      created_at   : str  (ISO-8601 UTC)
      config       : dict
      final_layout : dict | None
      drc_score    : float | None
      trajectory   : list of event dicts   ← appended atomically
  }

MongoDB absorbs the JSON document structure directly without rigid table
definitions, making it the ideal vault for the labeling dataset.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import motor.motor_asyncio


# ---------------------------------------------------------------------------
# Database class
# ---------------------------------------------------------------------------


class MongoDatabase:
    """Async MongoDB adapter for sessions and trajectory events."""

    def __init__(self, mongo_uri: str = "mongodb://localhost:27017", db_name: str = "ic_layout"):
        self._client = motor.motor_asyncio.AsyncIOMotorClient(mongo_uri)
        self._db = self._client[db_name]
        self._sessions = self._db["sessions"]

    async def close(self):
        self._client.close()

    # ------------------------------------------------------------------
    # Indexes — called once at startup
    # ------------------------------------------------------------------

    async def init_indexes(self):
        await self._sessions.create_index("created_at")

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    async def create_session(self, config: dict[str, Any] | None = None) -> str:
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "_id": session_id,
            "created_at": now,
            "config": config or {},
            "final_layout": None,
            "drc_score": None,
            "trajectory": [],
        }
        await self._sessions.insert_one(doc)
        return session_id

    async def record_event(self, session_id: str, event: dict[str, Any]) -> None:
        """Atomically append one trajectory event to the session document."""
        now = datetime.now(timezone.utc).isoformat()
        timestamped = {"timestamp": event.get("timestamp", now), **event}
        await self._sessions.update_one(
            {"_id": session_id},
            {"$push": {"trajectory": timestamped}},
        )

    async def save_layout(self, session_id: str, layout: dict[str, Any]) -> None:
        drc_score = layout.get("drc_score")
        await self._sessions.update_one(
            {"_id": session_id},
            {"$set": {"final_layout": layout, "drc_score": drc_score}},
        )

    async def export_session(self, session_id: str) -> dict[str, Any] | None:
        doc = await self._sessions.find_one({"_id": session_id})
        if not doc:
            return None
        return {
            "session_id": doc["_id"],
            "created_at": doc["created_at"],
            "config": doc.get("config", {}),
            "final_layout": doc.get("final_layout"),
            "drc_score": doc.get("drc_score"),
            "trajectory": doc.get("trajectory", []),
        }

    async def list_sessions(self) -> list[dict[str, Any]]:
        cursor = self._sessions.find(
            {},
            {"_id": 1, "created_at": 1, "drc_score": 1},
            sort=[("created_at", -1)],
        )
        results = []
        async for doc in cursor:
            results.append(
                {
                    "session_id": doc["_id"],
                    "created_at": doc["created_at"],
                    "drc_score": doc.get("drc_score"),
                }
            )
        return results
