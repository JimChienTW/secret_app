"""
app.py — Flask REST API for the interactive 3D IC layout tool.

Endpoints
---------
GET  /                              Serve frontend index.html
POST /api/session/new               Create a new recording session
POST /api/session/<id>/record       Append one interaction event
POST /api/session/<id>/save         Save the final layout snapshot
GET  /api/session/<id>/export       Export full session + trajectory JSON
GET  /api/sessions                  List all sessions (summary)
POST /api/autoroute                 Run auto-router for a single net
POST /api/drc                       Run DRC on a layout and return score
"""

import os
import sys

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

sys.path.insert(0, os.path.dirname(__file__))
from autorouter import AutoRouter
from database import Database
from drc import DRCChecker

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
CORS(app)

db = Database(os.path.join(DATA_DIR, "sessions.db"))


# ---------------------------------------------------------------------------
# Static frontend
# ---------------------------------------------------------------------------


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------


@app.route("/api/session/new", methods=["POST"])
def new_session():
    data = request.get_json(silent=True) or {}
    config = data.get("config", {})
    session_id = db.create_session(config)
    return jsonify({"session_id": session_id}), 201


@app.route("/api/session/<session_id>/record", methods=["POST"])
def record_event(session_id: str):
    event = request.get_json(silent=True)
    if not event:
        return jsonify({"error": "No event payload"}), 400
    db.record_event(session_id, event)
    return jsonify({"status": "ok"})


@app.route("/api/session/<session_id>/save", methods=["POST"])
def save_layout(session_id: str):
    layout = request.get_json(silent=True)
    if not layout:
        return jsonify({"error": "No layout payload"}), 400
    db.save_layout(session_id, layout)
    return jsonify({"status": "ok"})


@app.route("/api/session/<session_id>/export", methods=["GET"])
def export_session(session_id: str):
    data = db.export_session(session_id)
    if data is None:
        return jsonify({"error": "Session not found"}), 404
    return jsonify(data)


@app.route("/api/sessions", methods=["GET"])
def list_sessions():
    return jsonify(db.list_sessions())


# ---------------------------------------------------------------------------
# Auto-routing
# ---------------------------------------------------------------------------


@app.route("/api/autoroute", methods=["POST"])
def autoroute():
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "No payload"}), 400

    layout = body.get("layout")
    net_name = body.get("net")
    if not layout or not net_name:
        return jsonify({"error": "Both 'layout' and 'net' are required"}), 400

    router = AutoRouter(layout)
    result = router.route_net(net_name)
    return jsonify(result)


# ---------------------------------------------------------------------------
# DRC
# ---------------------------------------------------------------------------


@app.route("/api/drc", methods=["POST"])
def run_drc():
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "No payload"}), 400

    layout = body.get("layout")
    if not layout:
        return jsonify({"error": "'layout' is required"}), 400

    checker = DRCChecker(layout)
    result = checker.check_all()
    return jsonify(result)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Enable debug mode only when explicitly requested via the DEBUG env var.
    # Never run with debug=True in production — it exposes an interactive
    # debugger that allows arbitrary code execution.
    import os
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug, port=5000)
