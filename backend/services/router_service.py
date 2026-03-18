"""
services/router_service.py
==========================
Abstract interface for the A* (or BFS) net router.

To integrate your own A* implementation, subclass ``RouterService`` and
override ``route_net``, then pass an instance to FastAPI at startup via
the ``set_router_service`` helper (see ``main.py``).

The ``DummyRouterService`` is the default; it returns an empty routing
result so the API surface works end-to-end without any solver present.
The ``BFSRouterService`` delegates to the existing Lee's BFS autorouter.
"""

from __future__ import annotations

import sys
import os
from abc import ABC, abstractmethod
from typing import Any


class RouterService(ABC):
    """
    Pluggable interface for net routing.

    Parameters fed to ``route_net`` are plain ``dict`` objects so that
    any external solver can be dropped in without Pydantic coupling.
    """

    @abstractmethod
    def route_net(self, layout: dict[str, Any], net_name: str) -> dict[str, Any]:
        """
        Route *net_name* through *layout* and return a result dict with keys:
          - status  : "success" | "partial" | "error"
          - wires   : list of wire dicts  { net, layer, x1, y1, x2, y2 }
          - vias    : list of via dicts   { net, x, y, from_layer, to_layer }
          - net     : echo of *net_name*
          - message : (optional) human-readable note
        """


# ---------------------------------------------------------------------------
# Dummy implementation (safe default — no solver needed)
# ---------------------------------------------------------------------------


class DummyRouterService(RouterService):
    """
    Stub router that immediately returns an empty-but-valid result.

    Replace this with your real A* solver by subclassing ``RouterService``.
    """

    def route_net(self, layout: dict[str, Any], net_name: str) -> dict[str, Any]:
        return {
            "status": "success",
            "wires": [],
            "vias": [],
            "net": net_name,
            "message": "Dummy router — no wires placed. Plug in your A* solver.",
        }


# ---------------------------------------------------------------------------
# Real BFS implementation (delegates to existing autorouter.py)
# ---------------------------------------------------------------------------


class BFSRouterService(RouterService):
    """
    Wraps the existing Lee's BFS multi-layer autorouter (``autorouter.py``).

    This is the production default when ``autorouter.py`` is present on the
    Python path (i.e. when running from the ``backend/`` directory).
    """

    def route_net(self, layout: dict[str, Any], net_name: str) -> dict[str, Any]:
        # Import lazily so the service can be instantiated without the module
        sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
        from autorouter import AutoRouter  # noqa: PLC0415

        router = AutoRouter(layout)
        return router.route_net(net_name)
