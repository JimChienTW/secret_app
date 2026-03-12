"""
autorouter.py — Multi-layer Lee's BFS algorithm respecting per-layer routing direction.

Layer directions:
  'horizontal' — wires only run left/right on this layer
  'vertical'   — wires only run up/down on this layer

Vias switch between adjacent layers (cost = VIA_COST steps).
"""
from collections import deque


VIA_COST = 3  # BFS expansion penalty per via (spread equivalent)


class AutoRouter:
    """Route a single net through the 3-D grid using Lee's algorithm."""

    def __init__(self, layout: dict):
        self.layout = layout
        gs = layout.get("grid_size", {})
        self.grid_w: int = gs.get("width", 20)
        self.grid_h: int = gs.get("height", 20)
        self.layers: list[dict] = layout.get("layers", [])
        self.num_layers: int = len(self.layers)

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def route_net(self, net_name: str) -> dict:
        """
        Route all pins of *net_name* and return updated wires/vias.
        Existing routing for the net is cleared first.
        """
        pins = self._get_net_pins(net_name)
        if len(pins) < 2:
            return {
                "status": "error",
                "message": f"Net '{net_name}' has fewer than 2 pins.",
                "wires": [],
                "vias": [],
            }

        blocked = self._get_blocked_cells(exclude_net=net_name)
        all_wires: list[dict] = []
        all_vias: list[dict] = []
        routed_cells: set[tuple] = set()

        # Clear previous routing for this net from the layout copy
        for layer in self.layers:
            layer["wires"] = [w for w in layer.get("wires", []) if w.get("net") != net_name]
            layer["vias"] = [v for v in layer.get("vias", []) if v.get("net") != net_name]

        # Sequential Steiner-tree approximation: connect pin[0] → pin[i]
        for i in range(1, len(pins)):
            path = self._lee_route(pins[0], pins[i], blocked | routed_cells)
            if path:
                wires, vias = self._path_to_segments(path, net_name)
                all_wires.extend(wires)
                all_vias.extend(vias)
                for step in path:
                    routed_cells.add((step["x"], step["y"], step["layer"]))
            else:
                return {
                    "status": "partial",
                    "message": f"Could not route all pins of '{net_name}'.",
                    "wires": all_wires,
                    "vias": all_vias,
                    "net": net_name,
                }

        return {
            "status": "success",
            "wires": all_wires,
            "vias": all_vias,
            "net": net_name,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_layer_direction(self, layer_id: int) -> str:
        if 0 <= layer_id < len(self.layers):
            return self.layers[layer_id].get("direction", "horizontal")
        return "horizontal" if layer_id % 2 == 0 else "vertical"

    def _get_blocked_cells(self, exclude_net: str | None = None) -> set[tuple]:
        blocked: set[tuple] = set()
        for layer in self.layers:
            lid = layer["id"]
            for wire in layer.get("wires", []):
                if wire.get("net") == exclude_net:
                    continue
                x1, y1, x2, y2 = wire["x1"], wire["y1"], wire["x2"], wire["y2"]
                if x1 == x2:
                    for y in range(min(y1, y2), max(y1, y2) + 1):
                        blocked.add((x1, y, lid))
                else:
                    for x in range(min(x1, x2), max(x1, x2) + 1):
                        blocked.add((x, y1, lid))
            for via in layer.get("vias", []):
                if via.get("net") == exclude_net:
                    continue
                blocked.add((via["x"], via["y"], lid))
                blocked.add((via["x"], via["y"], via.get("to_layer", lid + 1)))
        return blocked

    def _get_net_pins(self, net_name: str) -> list[dict]:
        pins = []
        for layer in self.layers:
            lid = layer["id"]
            for pin in layer.get("pins", []):
                if pin.get("net") == net_name:
                    pins.append({"x": pin["x"], "y": pin["y"], "layer": lid})
        return pins

    def _lee_route(self, src: dict, dst: dict, blocked: set[tuple]) -> list[dict] | None:
        """BFS on the 3-D (x, y, layer) grid respecting direction constraints."""
        start = (src["x"], src["y"], src["layer"])
        end = (dst["x"], dst["y"], dst["layer"])

        if start == end:
            return [{"x": src["x"], "y": src["y"], "layer": src["layer"]}]

        # (cost, node, path)
        queue: deque[tuple] = deque()
        queue.append((start, [{"x": src["x"], "y": src["y"], "layer": src["layer"]}]))
        visited: set[tuple] = {start}

        while queue:
            (x, y, layer), path = queue.popleft()
            direction = self._get_layer_direction(layer)

            # Same-layer moves restricted by direction
            candidates: list[tuple[int, int, int]] = []
            if direction == "horizontal":
                candidates += [(x - 1, y, layer), (x + 1, y, layer)]
            else:
                candidates += [(x, y - 1, layer), (x, y + 1, layer)]

            # Via moves to adjacent layers
            if layer > 0:
                candidates.append((x, y, layer - 1))
            if layer < self.num_layers - 1:
                candidates.append((x, y, layer + 1))

            for nx, ny, nl in candidates:
                node = (nx, ny, nl)
                if node == end:
                    return path + [{"x": nx, "y": ny, "layer": nl}]
                if (
                    0 <= nx < self.grid_w
                    and 0 <= ny < self.grid_h
                    and node not in visited
                    and node not in blocked
                ):
                    visited.add(node)
                    queue.append((node, path + [{"x": nx, "y": ny, "layer": nl}]))

        return None  # No path found

    def _path_to_segments(
        self, path: list[dict], net_name: str
    ) -> tuple[list[dict], list[dict]]:
        """Convert a cell-by-cell path into wire segments and via objects."""
        wires: list[dict] = []
        vias: list[dict] = []

        i = 0
        while i < len(path) - 1:
            curr = path[i]
            nxt = path[i + 1]

            if curr["layer"] != nxt["layer"]:
                # Via transition
                vias.append(
                    {
                        "net": net_name,
                        "x": curr["x"],
                        "y": curr["y"],
                        "from_layer": curr["layer"],
                        "to_layer": nxt["layer"],
                    }
                )
                i += 1
                continue

            # Wire segment — extend as far as possible in the same direction
            layer = curr["layer"]
            sx, sy = curr["x"], curr["y"]
            j = i + 1
            while j < len(path) and path[j]["layer"] == layer:
                prev, cur2 = path[j - 1], path[j]
                # Stop if direction changes
                if cur2["x"] != prev["x"] and cur2["y"] != prev["y"]:
                    break
                j += 1

            end_cell = path[j - 1]
            if sx != end_cell["x"] or sy != end_cell["y"]:
                wires.append(
                    {
                        "net": net_name,
                        "layer": layer,
                        "x1": sx,
                        "y1": sy,
                        "x2": end_cell["x"],
                        "y2": end_cell["y"],
                    }
                )
            i = j - 1

        return wires, vias
