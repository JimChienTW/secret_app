"""
models.py — Pydantic v2 models for strict request/response validation.

FastAPI uses these to validate all incoming JSON bodies, guaranteeing
that malformed data is rejected before it reaches any service layer.
"""

from __future__ import annotations

from typing import Any, List, Literal, Optional, Union
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Layout primitives
# ---------------------------------------------------------------------------


class GridSize(BaseModel):
    width: int = Field(default=20, ge=1)
    height: int = Field(default=20, ge=1)


class Wire(BaseModel):
    net: str
    layer: int = Field(ge=0)
    x1: int = Field(ge=0)
    y1: int = Field(ge=0)
    x2: int = Field(ge=0)
    y2: int = Field(ge=0)


class Via(BaseModel):
    net: str
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    from_layer: int = Field(ge=0)
    to_layer: int = Field(ge=0)


class Pin(BaseModel):
    net: str
    x: int = Field(ge=0)
    y: int = Field(ge=0)


class Layer(BaseModel):
    id: int = Field(ge=0)
    name: str
    direction: Literal["horizontal", "vertical"]
    wires: List[Wire] = []
    vias: List[Via] = []
    pins: List[Pin] = []


class Layout(BaseModel):
    grid_size: GridSize = GridSize()
    nets: List[str]
    layers: List[Layer]
    drc_score: Optional[float] = None


# ---------------------------------------------------------------------------
# Trajectory events (discriminated union on "type")
# ---------------------------------------------------------------------------


class WireEvent(BaseModel):
    type: Literal["wire_draw"]
    layer: int = Field(ge=0)
    net: str
    x1: int
    y1: int
    x2: int
    y2: int
    timestamp: Optional[str] = None


class ViaEvent(BaseModel):
    type: Literal["via_place"]
    from_layer: int = Field(ge=0)
    to_layer: int = Field(ge=0)
    x: int
    y: int
    timestamp: Optional[str] = None


class UndoEvent(BaseModel):
    type: Literal["undo"]
    timestamp: Optional[str] = None


class DRCEvent(BaseModel):
    type: Literal["drc"]
    score: float = Field(ge=0.0, le=100.0)
    total_violations: int = Field(ge=0)
    timestamp: Optional[str] = None


class AutorouteEvent(BaseModel):
    type: Literal["autoroute"]
    net: str
    timestamp: Optional[str] = None


# Flexible union — FastAPI will try each discriminator value in order
TrajectoryEvent = Union[WireEvent, ViaEvent, UndoEvent, DRCEvent, AutorouteEvent]


# ---------------------------------------------------------------------------
# Session-level models
# ---------------------------------------------------------------------------


class NewSessionRequest(BaseModel):
    config: Optional[dict[str, Any]] = {}


class RecordEventRequest(BaseModel):
    """
    Wraps a single trajectory event.
    FastAPI will validate the discriminated union and reject unknown types.
    """

    event: TrajectoryEvent = Field(discriminator="type")


class SaveLayoutRequest(BaseModel):
    layout: Layout


# ---------------------------------------------------------------------------
# Auto-route / DRC request models
# ---------------------------------------------------------------------------


class AutorouteRequest(BaseModel):
    layout: Layout
    net: str


class DRCRequest(BaseModel):
    layout: Layout


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class SessionSummary(BaseModel):
    session_id: str
    created_at: str
    drc_score: Optional[float] = None


class SessionExport(BaseModel):
    session_id: str
    created_at: str
    config: dict[str, Any]
    final_layout: Optional[dict[str, Any]] = None
    drc_score: Optional[float] = None
    trajectory: List[dict[str, Any]] = []


class AutorouteResponse(BaseModel):
    status: str
    wires: List[dict[str, Any]] = []
    vias: List[dict[str, Any]] = []
    net: str
    message: Optional[str] = None


class DRCResponse(BaseModel):
    score: float
    violations: List[dict[str, Any]] = []
    total_violations: int
