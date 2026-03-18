"""
services/drc_service.py
=======================
Abstract interface for the Design Rule Checker (DRC).

To plug in your own DRC engine, subclass ``DRCService`` and override
``check_all``, then pass the instance to FastAPI at startup via the
``set_drc_service`` helper (see ``main.py``).

The ``DummyDRCService`` returns a perfect 100/100 score with no violations.
The ``FullDRCService`` delegates to the existing ``drc.py`` checker.
"""

from __future__ import annotations

import sys
import os
from abc import ABC, abstractmethod
from typing import Any


class DRCService(ABC):
    """
    Pluggable interface for design-rule checking.

    ``check_all`` receives a plain ``dict`` layout and must return::

        {
            "score":            float,   # 0–100
            "violations":       list,    # list of violation dicts
            "total_violations": int,
        }
    """

    @abstractmethod
    def check_all(self, layout: dict[str, Any]) -> dict[str, Any]:
        """Run all DRC rules and return a scored violation report."""


# ---------------------------------------------------------------------------
# Dummy implementation (safe default — no DRC logic executed)
# ---------------------------------------------------------------------------


class DummyDRCService(DRCService):
    """
    Stub DRC that always returns a clean layout (100/100, zero violations).

    Replace this with your real DRC engine by subclassing ``DRCService``.
    """

    def check_all(self, layout: dict[str, Any]) -> dict[str, Any]:
        return {
            "score": 100.0,
            "violations": [],
            "total_violations": 0,
            "message": "Dummy DRC — no checks run. Plug in your DRC engine.",
        }


# ---------------------------------------------------------------------------
# Full implementation (delegates to existing drc.py)
# ---------------------------------------------------------------------------


class FullDRCService(DRCService):
    """
    Wraps the existing ``DRCChecker`` from ``drc.py``.

    This is the production default when ``drc.py`` is present on the
    Python path (i.e. when running from the ``backend/`` directory).
    """

    def check_all(self, layout: dict[str, Any]) -> dict[str, Any]:
        sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
        from drc import DRCChecker  # noqa: PLC0415

        checker = DRCChecker(layout)
        return checker.check_all()
