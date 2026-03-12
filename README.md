# 3D IC Layout Tool

An interactive, web-based 3D IC routing tool that collects **human interaction data** and **routing trajectories** for use as training datasets for LLMs/VLMs.

---

## Quick Start

### 1. Install Python dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Start the Flask backend

```bash
python backend/app.py
```

The server starts at **`http://localhost:5000`**.

### 3. Open the tool

Navigate to **`http://localhost:5000`** in your browser (Chrome/Edge recommended).

---

## Customisation

> **You only need to edit one file for most changes: `frontend/js/config.js`**

| What you want to change | Where to change it |
|---|---|
| Grid dimensions | `CONFIG.grid` in `config.js` |
| Add / remove layers, change routing direction | `CONFIG.layers` in `config.js` |
| Add / remove nets, change pin positions | `CONFIG.nets` in `config.js` |
| Change colours (wires, pins, UI) | `CONFIG.display` / net `color` in `config.js` |
| Change overall UI colours / sizes | CSS variables at the top of `frontend/css/style.css` |
| Backend server URL | `CONFIG.apiBase` in `config.js` |
| Add a new DRC rule | Add a `_check_<name>()` method to `DRCChecker` in `backend/drc.py` |

---

## Project Structure

```
secret_app/
├── backend/
│   ├── app.py            # Flask REST API — all endpoints
│   ├── autorouter.py     # Lee's BFS auto-router (multi-layer Manhattan)
│   ├── drc.py            # Design Rule Checker (add rules as _check_* methods)
│   ├── database.py       # SQLite session & trajectory storage
│   └── requirements.txt
└── frontend/
    ├── index.html        # HTML shell (layout only, no logic)
    ├── css/
    │   └── style.css     # Dark theme — CSS variables at the top for easy editing
    └── js/
        ├── config.js     # ★ EDIT THIS FILE for most customisations
        ├── api.js        # Thin wrappers for every backend endpoint
        ├── canvas.js     # CanvasRenderer — all drawing logic
        └── main.js       # App state, event handling, tool actions
```

---

## Tools

| Tool | How to use |
|---|---|
| **Wire** | Click to set the start point, click again to place the wire. The endpoint is automatically constrained to the layer's allowed direction (horizontal / vertical). Press **Esc** to cancel. |
| **Via** | Click a grid cell to place a via connecting the current layer to the one above it. |
| **Delete** | Click on a wire or via to remove it. |
| **Undo** | Revert the last action (up to 30 steps). |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Serve the frontend |
| `POST` | `/api/session/new` | Create a recording session |
| `POST` | `/api/session/<id>/record` | Append an interaction event to the trajectory |
| `POST` | `/api/session/<id>/save` | Save the final layout snapshot |
| `GET` | `/api/session/<id>/export` | Download full session JSON (layout + trajectory) |
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/autoroute` | Auto-route a single net (body: `{ layout, net }`) |
| `POST` | `/api/drc` | Run Design Rule Check (body: `{ layout }`) |

---

## Adding Custom DRC Rules

Open `backend/drc.py` and add a method whose name starts with `_check_`:

```python
def _check_my_new_rule(self):
    for layer in self.layers:
        # ... examine layer.get('wires', []) etc.
        if <violation_condition>:
            self._add_violation(
                rule     = 'MY_RULE',
                message  = 'Describe the problem here.',
                location = {'layer': layer['id'], 'x': x, 'y': y},
                severity = 'error',   # or 'warning'
            )
```

`check_all()` discovers and runs every `_check_*` method automatically.

---

## Data Format

Every exported session JSON looks like this:

```json
{
  "session_id": "...",
  "created_at": "2024-01-01T00:00:00+00:00",
  "config": {},
  "drc_score": 80,
  "final_layout": {
    "grid_size": { "width": 20, "height": 20 },
    "nets": ["VDD", "GND", "CLK", "DATA", "RESET"],
    "layers": [ { "id": 0, "name": "M1", "wires": [], "vias": [], "pins": [] }, "…" ]
  },
  "trajectory": [
    { "timestamp": "…", "type": "wire_draw", "layer": 0, "net": "VDD", "x1": 1, "y1": 1, "x2": 5, "y2": 1 },
    { "timestamp": "…", "type": "via_place", "from_layer": 0, "to_layer": 1, "x": 5, "y": 1 },
    { "timestamp": "…", "type": "undo" },
    { "timestamp": "…", "type": "drc", "score": 80, "total_violations": 2 }
  ]
}
```