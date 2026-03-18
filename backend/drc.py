"""
drc.py — Design Rule Checker for the 3D IC layout tool.

The class is intentionally extensible: add a method named _check_<rule>()
to introduce a new rule — it will be picked up automatically by check_all().

Built-in rules
--------------
INCOMPLETE_NET    — net has no routing at all
UNCONNECTED_PIN   — a pin of a net is not touched by any routed wire/via
SPACING_VIOLATION — two wires from different nets are adjacent (distance < min_spacing)
OUT_OF_BOUNDS     — a wire endpoint falls outside the grid
DIRECTION_VIOLATION — a wire on a horizontal layer is not horizontal (and vice-versa)
"""

POINTS_PER_VIOLATION = 10


class DRCChecker:
    """Run design-rule checks on a layout dict and return a scored report."""

    def __init__(self, layout: dict):
        self.layout = layout
        gs = layout.get("grid_size", {})
        self.grid_w: int = gs.get("width", 20)
        self.grid_h: int = gs.get("height", 20)
        self.layers: list[dict] = layout.get("layers", [])
        self.nets: list[str] = layout.get("nets", [])
        self.violations: list[dict] = []
        self.score: float = 100.0

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def check_all(self) -> dict:
        """Run all _check_* methods and return a scored violation report."""
        self.violations = []

        for attr in sorted(dir(self)):
            if attr.startswith("_check_") and callable(getattr(self, attr)):
                getattr(self, attr)()

        self.score = max(0.0, 100.0 - len(self.violations) * POINTS_PER_VIOLATION)
        return {
            "score": self.score,
            "violations": self.violations,
            "total_violations": len(self.violations),
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _add_violation(
        self,
        rule: str,
        message: str,
        location: dict | None = None,
        severity: str = "error",
    ):
        self.violations.append(
            {
                "rule": rule,
                "message": message,
                "location": location or {},
                "severity": severity,
            }
        )

    def _wire_cells(self, wire: dict, layer_id: int) -> set[tuple]:
        """Return the set of grid cells (x, y, layer) occupied by a wire."""
        cells: set[tuple] = set()
        x1, y1, x2, y2 = wire["x1"], wire["y1"], wire["x2"], wire["y2"]
        if x1 == x2:
            for y in range(min(y1, y2), max(y1, y2) + 1):
                cells.add((x1, y, layer_id))
        else:
            for x in range(min(x1, x2), max(x1, x2) + 1):
                cells.add((x, y1, layer_id))
        return cells

    def _routed_cells_for_net(self, net_name: str) -> set[tuple]:
        """Return all cells (x, y, layer) reached by wires/vias of a net."""
        cells: set[tuple] = set()
        for layer in self.layers:
            lid = layer["id"]
            for wire in layer.get("wires", []):
                if wire.get("net") == net_name:
                    cells |= self._wire_cells(wire, lid)
            for via in layer.get("vias", []):
                if via.get("net") == net_name:
                    cells.add((via["x"], via["y"], lid))
                    cells.add((via["x"], via["y"], via.get("to_layer", lid + 1)))
        return cells

    # ------------------------------------------------------------------
    # Built-in rules
    # ------------------------------------------------------------------

    def _check_incomplete_nets(self):
        """INCOMPLETE_NET — a net exists but has zero routing."""
        for net_name in self.nets:
            cells = self._routed_cells_for_net(net_name)
            if not cells:
                # Only flag if there are pins to connect
                has_pins = any(
                    pin.get("net") == net_name
                    for layer in self.layers
                    for pin in layer.get("pins", [])
                )
                if has_pins:
                    self._add_violation(
                        "INCOMPLETE_NET",
                        f'Net "{net_name}" has no routing.',
                        {"net": net_name},
                        "warning",
                    )

    def _check_unconnected_pins(self):
        """UNCONNECTED_PIN — a pin is not touched by any wire or via."""
        for layer in self.layers:
            lid = layer["id"]
            for pin in layer.get("pins", []):
                net_name = pin.get("net")
                if not net_name:
                    continue
                cells = self._routed_cells_for_net(net_name)
                if (pin["x"], pin["y"], lid) not in cells:
                    self._add_violation(
                        "UNCONNECTED_PIN",
                        f'Pin of net "{net_name}" at ({pin["x"]},{pin["y"]}) '
                        f"on layer {lid} is not connected.",
                        {"net": net_name, "x": pin["x"], "y": pin["y"], "layer": lid},
                        "error",
                    )

    def _check_spacing_violations(self):
        """
        SPACING_VIOLATION — two wires from different nets are too close
        (Manhattan distance < 1 on the same layer).
        """
        min_spacing = 1
        for layer in self.layers:
            lid = layer["id"]
            # Build per-net cell sets
            cells_by_net: dict[str, set[tuple]] = {}
            for wire in layer.get("wires", []):
                net = wire.get("net", "")
                if net not in cells_by_net:
                    cells_by_net[net] = set()
                cells_by_net[net] |= self._wire_cells(wire, lid)

            net_list = list(cells_by_net.keys())
            reported: set[tuple] = set()  # avoid duplicate violations

            for i in range(len(net_list)):
                for j in range(i + 1, len(net_list)):
                    net_a, net_b = net_list[i], net_list[j]
                    for xa, ya, _ in cells_by_net[net_a]:
                        for xb, yb, _ in cells_by_net[net_b]:
                            dist = abs(xa - xb) + abs(ya - yb)
                            if dist < min_spacing:
                                key = (min(net_a, net_b), max(net_a, net_b), xa, ya, lid)
                                if key not in reported:
                                    reported.add(key)
                                    self._add_violation(
                                        "SPACING_VIOLATION",
                                        f'Wire spacing violation between nets '
                                        f'"{net_a}" and "{net_b}" on layer {lid}.',
                                        {"layer": lid, "x": xa, "y": ya},
                                        "error",
                                    )

    def _check_out_of_bounds(self):
        """OUT_OF_BOUNDS — wire endpoint is outside the grid."""
        for layer in self.layers:
            lid = layer["id"]
            for wire in layer.get("wires", []):
                x1, y1, x2, y2 = wire["x1"], wire["y1"], wire["x2"], wire["y2"]
                if not (
                    0 <= x1 < self.grid_w
                    and 0 <= x2 < self.grid_w
                    and 0 <= y1 < self.grid_h
                    and 0 <= y2 < self.grid_h
                ):
                    self._add_violation(
                        "OUT_OF_BOUNDS",
                        f'Wire of net "{wire.get("net")}" on layer {lid} '
                        f"is outside grid boundaries.",
                        {"layer": lid, "x1": x1, "y1": y1, "x2": x2, "y2": y2},
                        "error",
                    )

    def _check_direction_violations(self):
        """DIRECTION_VIOLATION — a wire runs against its layer's allowed direction."""
        for layer in self.layers:
            lid = layer["id"]
            direction = layer.get("direction", "horizontal")
            for wire in layer.get("wires", []):
                if direction == "horizontal" and wire["y1"] != wire["y2"]:
                    self._add_violation(
                        "DIRECTION_VIOLATION",
                        f'Layer {lid} is horizontal but wire of net '
                        f'"{wire.get("net")}" is vertical.',
                        {"layer": lid, "x1": wire["x1"], "y1": wire["y1"],
                         "x2": wire["x2"], "y2": wire["y2"]},
                        "error",
                    )
                elif direction == "vertical" and wire["x1"] != wire["x2"]:
                    self._add_violation(
                        "DIRECTION_VIOLATION",
                        f'Layer {lid} is vertical but wire of net '
                        f'"{wire.get("net")}" is horizontal.',
                        {"layer": lid, "x1": wire["x1"], "y1": wire["y1"],
                         "x2": wire["x2"], "y2": wire["y2"]},
                        "error",
                    )
