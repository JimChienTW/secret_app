"""
main.py — FastAPI backend for the interactive 3D IC layout tool.

Design goals
------------
* Strict validation  : every incoming JSON body is validated via Pydantic
                       models in models.py before any service is called.
* Async performance  : heavy CPU-bound tasks (DRC, routing) are offloaded
                       to a thread-pool executor so other labeling users
                       are never blocked.
* Pluggable services : RouterService and DRCService are injected via
                       module-level singletons.  Swap the default
                       implementations by calling set_router_service() /
                       set_drc_service() before startup, or replace them
                       with your own A* solver / DRC engine at any time.
* MongoDB storage    : MongoDatabase (motor async driver) stores every
                       session document as a self-contained JSON blob.

Endpoints
---------
GET  /                              Serve the built React frontend
POST /api/session/new               Create a new recording session
POST /api/session/{id}/record       Append one trajectory event
POST /api/session/{id}/save         Save the final layout snapshot
GET  /api/session/{id}/export       Export full session + trajectory JSON
GET  /api/sessions                  List all sessions (summary)
POST /api/autoroute                 Route a single net (async, thread-pool)
POST /api/drc                       Run DRC on a layout  (async, thread-pool)
"""

from __future__ import annotations

import asyncio
import os
import sys
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# ---------------------------------------------------------------------------
# Path setup — allow sibling imports (autorouter, drc, models, ...)
# ---------------------------------------------------------------------------

sys.path.insert(0, os.path.dirname(__file__))

from models import (
    AutorouteRequest,
    AutorouteResponse,
    DRCRequest,
    DRCResponse,
    NewSessionRequest,
    RecordEventRequest,
    SaveLayoutRequest,
    SessionExport,
    SessionSummary,
)
from mongo_database import MongoDatabase
from services.drc_service import DRCService, FullDRCService
from services.router_service import BFSRouterService, RouterService

# ---------------------------------------------------------------------------
# Service singletons — swap these to inject a custom A* / DRC engine
# ---------------------------------------------------------------------------

_router_service: RouterService = BFSRouterService()
_drc_service: DRCService = FullDRCService()


def set_router_service(svc: RouterService) -> None:
    """Hot-swap the routing back-end (call before or after startup)."""
    global _router_service
    _router_service = svc


def set_drc_service(svc: DRCService) -> None:
    """Hot-swap the DRC back-end (call before or after startup)."""
    global _drc_service
    _drc_service = svc


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB  = os.environ.get("MONGO_DB", "ic_layout")

db = MongoDatabase(mongo_uri=MONGO_URI, db_name=MONGO_DB)

# ---------------------------------------------------------------------------
# Application lifecycle
# ---------------------------------------------------------------------------

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")


@asynccontextmanager
async def lifespan(application: FastAPI):
    await db.init_indexes()
    yield
    await db.close()


app = FastAPI(
    title="3D IC Layout Tool API",
    description=(
        "Interactive trajectory-labeling backend. "
        "Validate → Store → Train LLMs."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Static frontend — served from the Vite build output
# ---------------------------------------------------------------------------

if os.path.isdir(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/", include_in_schema=False)
    async def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------


@app.post("/api/session/new", status_code=status.HTTP_201_CREATED)
async def new_session(body: NewSessionRequest) -> dict[str, str]:
    session_id = await db.create_session(body.config)
    return {"session_id": session_id}


@app.post("/api/session/{session_id}/record")
async def record_event(session_id: str, body: RecordEventRequest) -> dict[str, str]:
    await db.record_event(session_id, body.event.model_dump(exclude_none=True))
    return {"status": "ok"}


@app.post("/api/session/{session_id}/save")
async def save_layout(session_id: str, body: SaveLayoutRequest) -> dict[str, str]:
    await db.save_layout(session_id, body.layout.model_dump(exclude_none=True))
    return {"status": "ok"}


@app.get("/api/session/{session_id}/export", response_model=SessionExport)
async def export_session(session_id: str) -> Any:
    data = await db.export_session(session_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return data


@app.get("/api/sessions", response_model=list[SessionSummary])
async def list_sessions() -> Any:
    return await db.list_sessions()


# ---------------------------------------------------------------------------
# Auto-routing  (CPU-bound → thread-pool so the event loop stays free)
# ---------------------------------------------------------------------------


@app.post("/api/autoroute", response_model=AutorouteResponse)
async def autoroute(body: AutorouteRequest) -> Any:
    layout_dict = body.layout.model_dump()
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, _router_service.route_net, layout_dict, body.net
    )
    return result


# ---------------------------------------------------------------------------
# Design Rule Check  (CPU-bound → thread-pool)
# ---------------------------------------------------------------------------


@app.post("/api/drc", response_model=DRCResponse)
async def run_drc(body: DRCRequest) -> Any:
    layout_dict = body.layout.model_dump()
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, _drc_service.check_all, layout_dict
    )
    return result


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    debug = os.environ.get("DEBUG", "0") == "1"
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=debug)
