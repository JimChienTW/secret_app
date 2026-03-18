# 3D IC Layout Tool

An interactive, web-based 3D IC routing tool that collects **human interaction data** and
**routing trajectories** for use as training datasets for LLMs/VLMs.

---

## Architecture

| Layer    | Technology            | Purpose |
|----------|-----------------------|---------|
| Frontend | React 18 + Konva.js   | 5-layer interactive canvas, component-based, local state for zero-lag waypoint recording |
| Backend  | Python FastAPI        | Async REST API, strict Pydantic validation, pluggable A*/DRC services |
| Database | MongoDB (Motor async) | Schema-free JSON vault for sessions and trajectory datasets |

---

## Quick Start

### Prerequisites

* Python 3.10+
* Node.js 18+
* MongoDB running on `localhost:27017`  
  (set `MONGO_URI` env var to override)

---

### 1 — Install Python dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2 — Start the FastAPI backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

The API + auto-generated docs are at **`http://localhost:8000/docs`**.

### 3 — Start the React dev server

```bash
cd frontend
npm install
npm run dev
```

Open **`http://localhost:5173`** — the Vite dev server proxies `/api/*` to FastAPI.

### 4 — Production build

```bash
cd frontend && npm run build  # output → frontend/dist/
```

FastAPI then serves the built app:

```bash
cd backend && uvicorn main:app --port 8000
```

Navigate to **`http://localhost:8000`**.

---

## Project Structure

```
secret_app/
├── backend/
│   ├── main.py               ★ FastAPI entry point (replaces app.py)
│   ├── models.py             ★ Pydantic v2 validation models
│   ├── mongo_database.py     ★ Async MongoDB adapter (Motor)
│   ├── services/
│   │   ├── router_service.py ★ Pluggable router interface + BFS/dummy impls
│   │   └── drc_service.py    ★ Pluggable DRC interface + full/dummy impls
│   ├── autorouter.py         Lee's BFS multi-layer auto-router (existing)
│   ├── drc.py                Design Rule Checker (existing)
│   ├── app.py                Legacy Flask backend (reference only)
│   ├── database.py           Legacy SQLite adapter (reference only)
│   └── requirements.txt
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx             ★ Root component, top-level state
        ├── config/
        │   └── defaults.js     ★ Grid, 5 layers, nets — edit for customisation
        ├── api/
        │   └── client.js       Thin fetch wrappers for every API endpoint
        ├── hooks/
        │   ├── useLayout.js    ★ Layout + waypoint state (local, no server lag)
        │   └── useSession.js   Session lifecycle (create / save / export)
        └── components/
            ├── TopBar.jsx
            ├── LeftPanel.jsx
            ├── RightPanel.jsx
            └── canvas/
                ├── ICCanvas.jsx     ★ Main Konva Stage, grid-snapping, events
                ├── GridLayer.jsx    Background grid
                ├── WireLayer.jsx    Wires + vias per metal layer
                ├── PinLayer.jsx     Fixed pin markers
                └── PreviewLayer.jsx Ghost preview while drawing
```

---

## Customisation

> **Edit `frontend/src/config/defaults.js`** for most changes.

| What to change | Where |
|---|---|
| Grid dimensions | `CONFIG.grid` |
| Layers (count, names, directions, colours) | `CONFIG.layers` |
| Nets / pin positions | `CONFIG.nets` |
| Backend URL (production override) | `CONFIG.apiBase` |
| Add a DRC rule | Add `_check_<name>()` to `DRCChecker` in `backend/drc.py` |

---

## Plugging in a Custom A\* Router or DRC Engine

The backend exposes two pluggable service interfaces. To integrate your own solver:

```python
# backend/services/router_service.py

class MyAStarRouter(RouterService):
    def route_net(self, layout: dict, net_name: str) -> dict:
        # ... call your A* solver ...
        return {"status": "success", "wires": [...], "vias": [...], "net": net_name}
```

Then in `main.py`:

```python
from services.router_service import MyAStarRouter
set_router_service(MyAStarRouter())
```

Same pattern applies to `DRCService` → `set_drc_service(...)`.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET`  | `/`                              | Serve built React frontend |
| `POST` | `/api/session/new`               | Create a new recording session |
| `POST` | `/api/session/{id}/record`       | Append one trajectory event (Pydantic-validated) |
| `POST` | `/api/session/{id}/save`         | Save the final layout snapshot |
| `GET`  | `/api/session/{id}/export`       | Download full session JSON (layout + trajectory) |
| `GET`  | `/api/sessions`                  | List all sessions |
| `POST` | `/api/autoroute`                 | Auto-route a single net (async, thread-pool) |
| `POST` | `/api/drc`                       | Run DRC (async, thread-pool) |

Interactive docs: `http://localhost:8000/docs`

---

## Trajectory / Data Format

```json
{
  "session_id": "...",
  "created_at": "2024-01-01T00:00:00+00:00",
  "config": {},
  "drc_score": 80,
  "final_layout": {
    "grid_size": { "width": 20, "height": 20 },
    "nets": ["VDD", "GND", "CLK", "DATA", "RESET"],
    "layers": [
      { "id": 0, "name": "M1", "direction": "horizontal", "wires": [], "vias": [], "pins": [] }
    ]
  },
  "trajectory": [
    { "timestamp": "…", "type": "wire_draw", "layer": 0, "net": "VDD", "x1": 1, "y1": 1, "x2": 5, "y2": 1 },
    { "timestamp": "…", "type": "via_place", "from_layer": 0, "to_layer": 1, "x": 5, "y": 1 },
    { "timestamp": "…", "type": "undo" },
    { "timestamp": "…", "type": "drc", "score": 80, "total_violations": 2 }
  ]
}
```

---

## Tools

| Tool | How to use |
|---|---|
| **Wire** | Click to set start, click again to place. Endpoint is constrained to the layer's direction. Press **Esc** to cancel. |
| **Via** | Click a cell to place a via connecting the active layer to the next. |
| **Delete** | Click on a wire or via to remove it. |
| **Undo** | Reverts the last action (up to 50 steps, stored locally). |
