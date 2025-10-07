#!/usr/bin/env python3
import os, json, time, threading, sqlite3, logging, re, queue
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import requests
from collections import deque
from flask import Flask, jsonify, send_from_directory, request, redirect, abort, Response, render_template_string, url_for

# ====== Ścieżki / Flask ======
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
# Serwujemy statyki własnym routerem (fallback na /app/static oraz /static)
app = Flask(__name__, static_folder=None)

# ====== Konfiguracja ======
OVERLAY_BASE = os.environ.get("UNO_BASE", "https://app.overlays.uno/apiv2/controlapps")
UNO_AUTH_BEARER = os.environ.get("UNO_AUTH_BEARER", "").strip()

def load_overlay_ids() -> Dict[str, str]:
    ids: Dict[str, str] = {}
    for k, v in os.environ.items():
        m = re.fullmatch(r"KORT(\d+)_ID", k)
        if m and v and v.strip():
            ids[m.group(1)] = v.strip()
    if not ids:
        for i in range(1, 5):
            val = os.environ.get(f"KORT{i}_ID", "").strip()
            if val:
                ids[str(i)] = val
    return dict(sorted(ids.items(), key=lambda kv: int(kv[0])))

OVERLAY_IDS = load_overlay_ids()

AUTH_HEADER = {"Content-Type": "application/json"}
if UNO_AUTH_BEARER:
    AUTH_HEADER["Authorization"] = f"Bearer {UNO_AUTH_BEARER}"

RPM_PER_COURT = int(os.environ.get("RPM_PER_COURT", "55"))
BURST = int(os.environ.get("BURST", "8"))

DB_PATH = os.environ.get("DB_PATH", "wyniki_archive.sqlite3")
PORT = int(os.environ.get("PORT", "8080"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
log = logging.getLogger("wyniki")

# ====== Baza ======
def db_conn():
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con

def db_init():
    con = db_conn()
    cur = con.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      kort_id TEXT NOT NULL,
      player TEXT NOT NULL,
      surname TEXT,
      points TEXT,
      set1 INTEGER,
      set2 INTEGER
    );
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS snapshot_meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      kort_id TEXT NOT NULL,
      overlay_visible INTEGER NOT NULL
    );
    """)
    con.commit()
    con.close()
db_init()

# ====== Stan w pamięci ======
RING_BUFFER_SIZE = int(os.environ.get("STATE_LOG_SIZE", "200"))

STATE_LOCK = threading.Lock()

class EventBroker:
    def __init__(self):
        self.listeners = set()
        self.lock = threading.Lock()

    def listen(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=25)
        with self.lock:
            self.listeners.add(q)
        return q

    def discard(self, q: queue.Queue) -> None:
        with self.lock:
            self.listeners.discard(q)

    def broadcast(self, payload: Dict[str, Any]) -> None:
        with self.lock:
            listeners = list(self.listeners)
        for q in listeners:
            try:
                q.put_nowait(payload)
            except queue.Full:
                pass

event_broker = EventBroker()

POINT_SEQUENCE = ["0", "15", "30", "40", "ADV"]

def _empty_player_state() -> Dict[str, Any]:
    return {
        "full_name": None,
        "surname": "-",
        "points": "-",
        "set1": 0,
        "set2": 0,
        "set3": 0,
        "current_games": 0,
    }

def _empty_court_state() -> Dict[str, Any]:
    return {
        "overlay_visible": None,
        "mode": None,
        "serve": None,
        "current_set": None,
        "match_time": {"seconds": 0, "running": False},
        "A": _empty_player_state(),
        "B": _empty_player_state(),
        "tie": {"visible": None, "A": 0, "B": 0},
        "local": {"commands": {}, "updated": None},
        "uno": {
            "last_command": None,
            "last_value": None,
            "last_payload": None,
            "last_status": None,
            "last_response": None,
            "updated": None,
        },
        "log": deque(maxlen=RING_BUFFER_SIZE),
        "updated": None,
    }

if OVERLAY_IDS:
    _initial_courts = sorted(OVERLAY_IDS.keys(), key=lambda v: int(v))
else:
    _initial_courts = [str(i) for i in range(1, 5)]

snapshots: Dict[str, Dict[str, Any]] = {k: _empty_court_state() for k in _initial_courts}

GLOBAL_LOG: deque = deque(maxlen=max(100, RING_BUFFER_SIZE * max(1, len(snapshots) or 1)))


def _available_courts():
    if OVERLAY_IDS:
        return [(k, OVERLAY_IDS[k]) for k in sorted(OVERLAY_IDS.keys(), key=lambda v: int(v))]
    return [(k, None) for k in sorted(snapshots.keys(), key=lambda v: int(v))]


def _render_file_template(relative_path: str, **context: Any):
    path = os.path.join(BASE_DIR, relative_path)
    with open(path, "r", encoding="utf-8") as handle:
        template = handle.read()
    return render_template_string(template, **context)

class TokenBucket:
    def __init__(self, rpm: int, burst: int):
        self.capacity = max(1, burst)
        self.tokens = float(self.capacity)
        self.refill_per_sec = float(rpm) / 60.0
        self.lock = threading.Lock()
        self.last = time.monotonic()
    def take(self, n=1) -> bool:
        with self.lock:
            now = time.monotonic()
            elapsed = now - self.last
            self.last = now
            self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_per_sec)
            if self.tokens >= n:
                self.tokens -= n
                return True
            return False

buckets = {k: TokenBucket(RPM_PER_COURT, BURST) for k in OVERLAY_IDS.keys()}

# ====== Helpery ======
def _surname(full: Optional[str]) -> str:
    if not full: return "-"
    parts = str(full).strip().split()
    return parts[-1] if parts else "-"

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _api_endpoint(kort_id: str) -> str:
    return f"{OVERLAY_BASE}/{OVERLAY_IDS[kort_id]}/api"

def _to_bool(val):
    if isinstance(val, bool): return val
    if isinstance(val, (int, float)): return val != 0
    if val is None: return None
    s = str(val).strip().lower()
    if s in ("true","1","yes","on","visible","show","shown","active","enabled"): return True
    if s in ("false","0","no","off","hidden","hide","invisible","inactive","disabled"): return False
    return None

def _ensure_court_state(kort_id: str) -> Dict[str, Any]:
    state = snapshots.get(kort_id)
    if state is None:
        state = _empty_court_state()
        snapshots[kort_id] = state
    return state

def _serialize_court_state(state: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "overlay_visible": state["overlay_visible"],
        "mode": state["mode"],
        "serve": state["serve"],
        "current_set": state["current_set"],
        "match_time": dict(state["match_time"]),
        "A": dict(state["A"]),
        "B": dict(state["B"]),
        "tie": dict(state["tie"]),
        "local": {
            "updated": state["local"]["updated"],
            "commands": {cmd: dict(info) for cmd, info in state["local"]["commands"].items()},
        },
        "uno": dict(state["uno"]),
        "log": list(state["log"]),
        "updated": state["updated"],
    }

def _serialize_all_states() -> Dict[str, Any]:
    with STATE_LOCK:
        return {kort: _serialize_court_state(state) for kort, state in snapshots.items()}

def _safe_copy(data: Any) -> Any:
    if data is None:
        return None
    if isinstance(data, (str, int, float, bool)):
        return data
    if isinstance(data, dict):
        return {str(k): _safe_copy(v) for k, v in data.items()}
    if isinstance(data, (list, tuple, set)):
        return [_safe_copy(v) for v in data]
    try:
        return json.loads(json.dumps(data))
    except (TypeError, ValueError):
        return str(data)

def _record_log_entry(state: Dict[str, Any], kort_id: str, source: str, command: str,
                      value: Any, extras: Optional[Dict[str, Any]], ts: str) -> Dict[str, Any]:
    entry: Dict[str, Any] = {
        "ts": ts,
        "source": source,
        "kort": kort_id,
        "command": command,
    }
    if value is not None:
        entry["value"] = value
    if extras:
        entry["extras"] = extras
    state["log"].append(entry)
    GLOBAL_LOG.append(entry)
    return entry

def _broadcast_kort_state(kort_id: str, event_type: str, command: str, value: Any,
                          extras: Optional[Dict[str, Any]], ts: str,
                          status: Optional[int] = None) -> None:
    with STATE_LOCK:
        state = snapshots.get(kort_id)
        if not state:
            return
        payload = {
            "type": event_type,
            "kort": kort_id,
            "ts": ts,
            "command": command,
            "value": value,
            "extras": extras,
            "state": _serialize_court_state(state),
        }
        if status is not None:
            payload["status"] = status
    event_broker.broadcast(payload)

ALLOWED_COMMAND_PREFIXES = (
    "set", "increase", "decrease", "reset", "show", "hide", "toggle",
    "play", "pause", "stop", "resume", "sync", "update"
)

def _validate_command(command: Any) -> bool:
    if not isinstance(command, str):
        return False
    stripped = command.strip()
    if not stripped:
        return False
    lower = stripped.lower()
    return any(lower.startswith(prefix) for prefix in ALLOWED_COMMAND_PREFIXES)

def _step_points(current: Any, delta: int) -> str:
    cur = str(current or "0").strip().upper()
    if cur not in POINT_SEQUENCE:
        cur = POINT_SEQUENCE[0]
    idx = POINT_SEQUENCE.index(cur)
    idx = max(0, min(len(POINT_SEQUENCE) - 1, idx + delta))
    return POINT_SEQUENCE[idx]

def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError, AttributeError):
        return default

def _apply_local_command(state: Dict[str, Any], command: str, value: Any,
                         extras: Optional[Dict[str, Any]]) -> bool:
    changed = False
    if command == "SetNamePlayerA":
        full = str(value or "").strip() or None
        state["A"]["full_name"] = full
        state["A"]["surname"] = _surname(full)
        changed = True
    elif command == "SetNamePlayerB":
        full = str(value or "").strip() or None
        state["B"]["full_name"] = full
        state["B"]["surname"] = _surname(full)
        changed = True
    elif command == "SetPointsPlayerA":
        state["A"]["points"] = str(value if value is not None else "-")
        changed = True
    elif command == "SetPointsPlayerB":
        state["B"]["points"] = str(value if value is not None else "-")
        changed = True
    elif command == "IncreasePointsPlayerA":
        state["A"]["points"] = _step_points(state["A"]["points"], +1)
        changed = True
    elif command == "IncreasePointsPlayerB":
        state["B"]["points"] = _step_points(state["B"]["points"], +1)
        changed = True
    elif command == "DecreasePointsPlayerA":
        state["A"]["points"] = _step_points(state["A"]["points"], -1)
        changed = True
    elif command == "DecreasePointsPlayerB":
        state["B"]["points"] = _step_points(state["B"]["points"], -1)
        changed = True
    elif command == "ResetPoints":
        state["A"]["points"] = "0"
        state["B"]["points"] = "0"
        changed = True
    else:
        set_match = re.fullmatch(r"SetSet([123])Player([AB])", command)
        if set_match:
            idx = set_match.group(1)
            side = set_match.group(2)
            key = f"set{idx}"
            state[side][key] = _as_int(value, 0)
            changed = True
        else:
            cur_match = re.fullmatch(r"SetCurrentSetPlayer([AB])", command)
            if cur_match:
                side = cur_match.group(1)
                state[side]["current_games"] = _as_int(value, 0)
                changed = True
            elif command == "IncreaseCurrentSetPlayerA":
                state["A"]["current_games"] = max(0, state["A"]["current_games"] + 1)
                changed = True
            elif command == "IncreaseCurrentSetPlayerB":
                state["B"]["current_games"] = max(0, state["B"]["current_games"] + 1)
                changed = True
            elif command == "DecreaseCurrentSetPlayerA":
                state["A"]["current_games"] = max(0, state["A"]["current_games"] - 1)
                changed = True
            elif command == "DecreaseCurrentSetPlayerB":
                state["B"]["current_games"] = max(0, state["B"]["current_games"] - 1)
                changed = True
            elif command == "SetCurrentSet":
                state["current_set"] = _as_int(value, 0) or None
                changed = True
            elif command == "SetSet":
                state["current_set"] = _as_int(value, 0) or None
                changed = True
            elif command == "IncreaseSet":
                state["current_set"] = (state["current_set"] or 0) + 1
                changed = True
            elif command == "DecreaseSet":
                current = state["current_set"] or 0
                current = max(0, current - 1)
                state["current_set"] = current or None
                changed = True
            else:
                tie_match = re.fullmatch(r"SetTieBreakPlayer([AB])", command)
                if tie_match:
                    side = tie_match.group(1)
                    state["tie"][side] = _as_int(value, 0)
                    changed = True
                elif command == "IncreaseTieBreakPlayerA":
                    state["tie"]["A"] = max(0, state["tie"]["A"] + 1)
                    changed = True
                elif command == "IncreaseTieBreakPlayerB":
                    state["tie"]["B"] = max(0, state["tie"]["B"] + 1)
                    changed = True
                elif command == "DecreaseTieBreakPlayerA":
                    state["tie"]["A"] = max(0, state["tie"]["A"] - 1)
                    changed = True
                elif command == "DecreaseTieBreakPlayerB":
                    state["tie"]["B"] = max(0, state["tie"]["B"] - 1)
                    changed = True
                elif command == "ResetTieBreak":
                    state["tie"]["A"] = 0
                    state["tie"]["B"] = 0
                    changed = True
                elif command == "SetTieBreakVisibility":
                    state["tie"]["visible"] = _to_bool(value)
                    changed = True
                elif command == "ShowTieBreak":
                    state["tie"]["visible"] = True
                    changed = True
                elif command == "HideTieBreak":
                    state["tie"]["visible"] = False
                    changed = True
                elif command == "ToggleTieBreak":
                    current = state["tie"].get("visible")
                    state["tie"]["visible"] = not current if current is not None else True
                    changed = True
                elif command == "SetServe":
                    if value is None:
                        state["serve"] = None
                    else:
                        val = str(value).strip().upper()
                        if val in ("A", "B"):
                            state["serve"] = val
                        else:
                            state["serve"] = None
                    changed = True
                elif command == "SetMode":
                    state["mode"] = str(value) if value is not None else None
                    changed = True
                elif command == "ShowOverlay":
                    state["overlay_visible"] = True
                    changed = True
                elif command == "HideOverlay":
                    state["overlay_visible"] = False
                    changed = True
                elif command == "ToggleOverlay":
                    current = state.get("overlay_visible")
                    state["overlay_visible"] = not current if current is not None else True
                    changed = True
                elif command == "SetOverlayVisibility":
                    state["overlay_visible"] = _to_bool(value)
                    changed = True
                elif command == "SetMatchTime":
                    state["match_time"]["seconds"] = max(0, _as_int(value, 0))
                    changed = True
                elif command == "ResetMatchTime":
                    state["match_time"]["seconds"] = 0
                    state["match_time"]["running"] = False
                    changed = True
                elif command == "PlayMatchTime":
                    state["match_time"]["running"] = True
                    changed = True
                elif command == "PauseMatchTime":
                    state["match_time"]["running"] = False
                    changed = True

    return changed

# ====== API ======
@app.route("/api/snapshot")
def api_snapshot():
    return jsonify(_serialize_all_states())

@app.route("/api/local/reflect/<kort_id>", methods=["POST"])
def api_local_reflect(kort_id: str):
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "invalid payload"}), 400

    command = payload.get("command")
    if not _validate_command(command):
        return jsonify({"error": "invalid command"}), 400

    value = payload.get("value")
    if value is None and "payload" in payload:
        value = payload.get("payload")
    extras_dict = {k: v for k, v in payload.items() if k not in {"command", "value"}}
    extras = extras_dict or None
    extras_copy = _safe_copy(extras)
    ts = _now_iso()

    with STATE_LOCK:
        state = _ensure_court_state(kort_id)
        changed = _apply_local_command(state, command, value, extras)
        state["local"]["commands"][command] = {
            "value": value,
            "extras": extras_copy,
            "ts": ts,
        }
        state["local"]["updated"] = ts
        state["updated"] = ts
        entry = _record_log_entry(state, kort_id, "reflect", command, value, extras_copy, ts)
        response_state = _serialize_court_state(state)

    log.info("reflect kort=%s command=%s value=%s extras=%s", kort_id, command, value, extras)
    _broadcast_kort_state(kort_id, "reflect", command, value, extras_copy, ts)

    return jsonify({
        "ok": True,
        "ts": ts,
        "changed": changed,
        "state": response_state,
        "log": entry,
    })

@app.route("/api/uno/exec/<kort_id>", methods=["POST"])
def api_uno_exec(kort_id: str):
    if kort_id not in OVERLAY_IDS:
        return jsonify({"error": "unknown kort"}), 404

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "invalid payload"}), 400

    command = payload.get("command")
    if not isinstance(command, str) or not command.strip():
        return jsonify({"error": "command required"}), 400

    bucket = buckets.get(kort_id)
    if bucket and not bucket.take():
        return jsonify({"error": "rate limited"}), 429

    ts = _now_iso()
    value = payload.get("value")
    extras_dict = {k: v for k, v in payload.items() if k not in {"command", "value"}}
    extras = extras_dict or None
    payload_copy = _safe_copy(payload)
    extras_copy = _safe_copy(extras)

    try:
        response = requests.put(_api_endpoint(kort_id), headers=AUTH_HEADER, json=payload, timeout=5)
        status_code = response.status_code
        content_type = response.headers.get("Content-Type", "")
        if "application/json" in content_type.lower():
            try:
                response_body: Any = response.json()
            except ValueError:
                response_body = {"raw": response.text}
        else:
            response_body = {"raw": response.text}
    except requests.RequestException as exc:
        log.warning("UNO proxy error kort=%s command=%s err=%s", kort_id, command, exc)
        response = None
        status_code = 502
        response_body = {"error": str(exc)}

    response_copy = _safe_copy(response_body)

    with STATE_LOCK:
        state = _ensure_court_state(kort_id)
        state["uno"].update({
            "last_command": command,
            "last_value": value,
            "last_payload": payload_copy,
            "last_status": status_code,
            "last_response": response_copy,
            "updated": ts,
        })
        state["updated"] = ts
        _record_log_entry(state, kort_id, "uno", command, value, extras_copy, ts)

    log.info("uno kort=%s command=%s value=%s status=%s", kort_id, command, value, status_code)
    _broadcast_kort_state(kort_id, "uno", command, value, extras_copy, ts, status=status_code)

    resp = jsonify(response_body)
    resp.status_code = status_code
    return resp

@app.route("/api/stream")
def api_stream():
    def event_stream():
        q = event_broker.listen()
        try:
            initial = _serialize_all_states()
            yield f"data: {json.dumps({'type': 'snapshot', 'state': initial})}\n\n"
            while True:
                try:
                    event = q.get(timeout=25)
                except queue.Empty:
                    yield "event: ping\ndata: {}\n\n"
                    continue
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            event_broker.discard(q)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return Response(event_stream(), mimetype="text/event-stream", headers=headers)

@app.route("/api/archive")
def api_archive():
    date = request.args.get("date")
    con = db_conn(); cur = con.cursor()
    if date:
        cur.execute("SELECT * FROM snapshots WHERE ts LIKE ? ORDER BY ts ASC", (f"{date}%",))
    else:
        cur.execute("SELECT * FROM snapshots ORDER BY ts DESC LIMIT 200")
    rows = [dict(r) for r in cur.fetchall()]
    con.close()
    return jsonify(rows)

@app.route("/healthz")
def healthz():
    try:
        con = db_conn(); con.execute("SELECT 1"); con.close()
        return "ok", 200
    except Exception as e:
        return f"db error: {e}", 500


@app.route("/control")
def control_index():
    korts = _available_courts()
    return _render_file_template(os.path.join("static", "control.html"), korts=korts)


@app.route("/control/<kort>")
def control_panel(kort: str):
    try:
        kort_norm = str(int(kort))
    except (TypeError, ValueError):
        abort(404)

    available = {k for k, _ in _available_courts()}
    if kort_norm not in available:
        abort(404)

    return redirect(url_for("uno_control_static", kort=kort_norm), code=302)


@app.route("/uno-control.html")
def uno_control_static():
    return send_from_directory(BASE_DIR, "uno-control.html")

# ====== Statyki z fallbackiem ======
@app.route("/static/<path:filename>")
def serve_static(filename):
    app_static = os.path.join(BASE_DIR, "static")
    path1 = os.path.join(app_static, filename)
    if os.path.isfile(path1):
        return send_from_directory(app_static, filename)
    path2 = os.path.join("/static", filename)
    if os.path.isfile(path2):
        return send_from_directory("/static", filename)
    abort(404)

# ====== Index / hash-fix ======
@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")

@app.route('/%23<path:frag>')
def hash_fix(frag):
    return redirect('/#' + frag, code=302)
