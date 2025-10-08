#!/usr/bin/env python3
import os, json, time, threading, sqlite3, logging, re, queue
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import requests
from collections import deque
from flask import Flask, jsonify, send_from_directory, request, redirect, abort, Response, render_template_string, url_for, stream_with_context

# ====== Ścieżki / Flask ======
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
UNO_CONTROL_TEMPLATE = "uno-control.html"
CONTROL_LIST_TEMPLATE = os.path.join("static", "control.html")
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
            raw_idx = m.group(1)
            try:
                norm_idx = str(int(raw_idx))
            except ValueError:
                norm_idx = raw_idx.lstrip("0") or raw_idx or "0"
            ids[norm_idx] = v.strip()
    if not ids:
        for i in range(1, 5):
            val = os.environ.get(f"KORT{i}_ID", "").strip()
            if val:
                ids[str(i)] = val
    return dict(sorted(ids.items(), key=lambda kv: int(kv[0])))

OVERLAY_IDS = load_overlay_ids()
OVERLAY_ID_TO_KORT = {v: k for k, v in OVERLAY_IDS.items()}

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
        "points": "0",
        "set1": 0,
        "set2": 0,
        "set3": 0,
        "current_games": 0,
        "flag_url": None,
        "flag_code": None,
    }

def _empty_court_state() -> Dict[str, Any]:
    return {
        "overlay_visible": None,
        "mode": None,
        "serve": None,
        "current_set": 1,
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


def _normalize_kort_id(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    if text.isdigit():
        try:
            return str(int(text))
        except ValueError:
            pass
    normalized = text.lstrip("0")
    return normalized or text


def _is_known_kort(kort_id: str) -> bool:
    if not kort_id:
        return False
    if OVERLAY_IDS:
        return kort_id in OVERLAY_IDS
    return kort_id in snapshots


def _overlay_id_from_url(uno_url: Optional[str]) -> Optional[str]:
    if not uno_url:
        return None
    try:
        match = re.search(r"/controlapps/([^/]+)/api", str(uno_url))
        if match:
            return match.group(1)
    except re.error:
        return None
    return None


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

def _shorten(data, limit=120):
    try:
        text = json.dumps(data, ensure_ascii=False)
    except TypeError:
        text = str(data)
    if len(text) > limit:
        return text[:limit] + '...'
    return text

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
        if extras:
            flag_url = extras.get("flagUrl") or extras.get("flag_url")
            flag_code = extras.get("flag") or extras.get("flagCode") or extras.get("flag_code")
            if flag_url is not None:
                state["A"]["flag_url"] = flag_url or None
            if flag_code is not None:
                state["A"]["flag_code"] = (str(flag_code).lower() or None)
        changed = True
    elif command == "SetNamePlayerB":
        full = str(value or "").strip() or None
        state["B"]["full_name"] = full
        state["B"]["surname"] = _surname(full)
        if extras:
            flag_url = extras.get("flagUrl") or extras.get("flag_url")
            flag_code = extras.get("flag") or extras.get("flagCode") or extras.get("flag_code")
            if flag_url is not None:
                state["B"]["flag_url"] = flag_url or None
            if flag_code is not None:
                state["B"]["flag_code"] = (str(flag_code).lower() or None)
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

# ====== Widoki ======
@app.route("/")
def index():
    return _render_file_template("index.html")


@app.route("/static/<path:filename>")
def static_files(filename: str):
    safe_path = os.path.normpath(filename)
    if safe_path.startswith("..") or os.path.isabs(filename):
        abort(404)
    return send_from_directory(STATIC_DIR, safe_path)


@app.route("/control")
@app.route("/control/")
def control_list():
    korts = _available_courts()
    return _render_file_template(CONTROL_LIST_TEMPLATE, korts=korts)


@app.route("/control/<kort_id>")
def control_panel(kort_id: str):
    normalized = _normalize_kort_id(kort_id)
    if not normalized:
        abort(404)

    # ZAWSZE utwórz/upewnij się, że istnieje lokalny stan dla kortu,
    # żeby UI mogło działać nawet bez UNO_ID.
    with STATE_LOCK:
        _ensure_court_state(normalized)

    return _render_file_template(UNO_CONTROL_TEMPLATE, kort=normalized)

# ====== API ======
@app.route("/api/snapshot")
def api_snapshot():
    return jsonify(_serialize_all_states())


@app.route("/api/stream")
def api_stream():
    log.info("stream connection from %s", request.remote_addr)
    def event_stream():
        queue_obj = event_broker.listen()
        try:
            snapshot_payload = {
                "type": "snapshot",
                "ts": _now_iso(),
                "state": _serialize_all_states(),
            }
            yield f"data: {json.dumps(snapshot_payload, ensure_ascii=False)}\n\n"
            while True:
                try:
                    payload = queue_obj.get(timeout=20)
                except queue.Empty:
                    yield "event: ping\ndata: {}\n\n"
                    continue
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
        finally:
            event_broker.discard(queue_obj)

    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return Response(stream_with_context(event_stream()), headers=headers)


@app.route("/api/mirror", methods=["POST"])
def api_mirror():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "invalid payload"}), 400

    uno_url = payload.get("unoUrl") or payload.get("uno_url")
    overlay_id = _overlay_id_from_url(uno_url)

    kort_id = None
    if overlay_id:
        kort_id = OVERLAY_ID_TO_KORT.get(overlay_id)
    if not kort_id:
        kort_id = payload.get("kort")
    if not kort_id and overlay_id:
        kort_id = overlay_id
    if not kort_id:
        return jsonify({"ok": False, "error": "unknown kort"}), 400
    kort_id = str(kort_id)

    body = payload.get("unoBody")

    log.info("mirror received overlay=%s kort=%s command=%s value=%s extras=%s uno_url=%s", overlay_id, kort_id, command, _shorten(value), _shorten(extras), uno_url)

    if body is None and isinstance(payload.get("unoBodyRaw"), str):
        try:
            body = json.loads(payload["unoBodyRaw"])
        except (TypeError, ValueError, json.JSONDecodeError):  # type: ignore[attr-defined]
            body = None

    body = body if isinstance(body, dict) else {}
    command = body.get("command") or payload.get("command")
    value = body.get("value")
    extras = {k: v for k, v in body.items() if k not in {"command", "value"}}

    ts = payload.get("mirroredAt") or _now_iso()
    status_code = payload.get("unoStatus")
    ok_flag = payload.get("unoOk")
    response_payload = payload.get("unoResponse")

    extras_for_log = {
        "uno_status": status_code,
        "uno_ok": ok_flag,
        "uno_method": payload.get("unoMethod"),
        "uno_url": uno_url,
    }
    if extras:
        extras_for_log["payload_extras"] = _safe_copy(extras)
    if overlay_id:
        extras_for_log["overlay_id"] = overlay_id

    extras_for_log = {k: v for k, v in extras_for_log.items() if v is not None}

    with STATE_LOCK:
        state = _ensure_court_state(kort_id)
        changed = False
        if command:
            try:
                changed = _apply_local_command(state, command, value, extras or None)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "mirror apply failed kort=%s command=%s error=%s",
                    kort_id,
                    command,
                    exc,
                )
        if changed and command:
            state["local"]["commands"][command] = {
                "value": _safe_copy(value),
                "extras": _safe_copy(extras) if extras else None,
                "ts": ts,
            }
            state["local"]["updated"] = ts
        elif changed:
            state["local"]["updated"] = ts
        uno_state = state["uno"]
        uno_state["last_command"] = command
        uno_state["last_value"] = _safe_copy(value)
        uno_state["last_payload"] = _safe_copy(body)
        uno_state["last_status"] = status_code
        uno_state["last_response"] = _safe_copy(response_payload)
        uno_state["updated"] = ts
        state["updated"] = ts
        entry = _record_log_entry(
            state,
            kort_id,
            "mirror",
            command or "unknown",
            _safe_copy(value),
            extras_for_log or None,
            ts,
        )
        response_state = _serialize_court_state(state)

        a_state = state["A"]
        b_state = state["B"]
        log.info("mirror state kort=%s A=%s flag=%s pts=%s sets=(%s,%s) B=%s flag=%s pts=%s sets=(%s,%s) current_set=%s",
                 kort_id,
                 _shorten(a_state.get("full_name") or a_state.get("surname")),
                 _shorten(a_state.get("flag_url") or a_state.get("flag_code")),
                 a_state.get("points"),
                 a_state.get("set1"),
                 a_state.get("set2"),
                 _shorten(b_state.get("full_name") or b_state.get("surname")),
                 _shorten(b_state.get("flag_url") or b_state.get("flag_code")),
                 b_state.get("points"),
                 b_state.get("set1"),
                 b_state.get("set2"),
                 state.get("current_set"))

    broadcast_extras = _safe_copy(extras) if extras else None
    _broadcast_kort_state(
        kort_id,
        "mirror",
        command or "unknown",
        _safe_copy(value),
        broadcast_extras,
        ts,
        status_code,
    )

    log.info(
        "mirror kort=%s overlay=%s command=%s status=%s",
        kort_id,
        overlay_id,
        command,
        status_code,
    )

    return jsonify({
        "ok": True,
        "kort": kort_id,
        "overlay": overlay_id,
        "command": command,
        "ts": ts,
        "state": response_state,
        "log": entry,
    })

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

        a_state = state["A"]
        b_state = state["B"]
        log.info("mirror state kort=%s A=%s flag=%s pts=%s sets=(%s,%s) B=%s flag=%s pts=%s sets=(%s,%s) current_set=%s",
                 kort_id,
                 _shorten(a_state.get("full_name") or a_state.get("surname")),
                 _shorten(a_state.get("flag_url") or a_state.get("flag_code")),
                 a_state.get("points"),
                 a_state.get("set1"),
                 a_state.get("set2"),
                 _shorten(b_state.get("full_name") or b_state.get("surname")),
                 _shorten(b_state.get("flag_url") or b_state.get("flag_code")),
                 b_state.get("points"),
                 b_state.get("set1"),
                 b_state.get("set2"),
                 state.get("current_set"))

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
    value_copy = _safe_copy(value)
    extras_dict = {k: v for k, v in payload.items() if k not in {"command", "value"}}
    extras = extras_dict or None
    payload_copy = _safe_copy(payload)
    extras_copy = _safe_copy(extras)

    status_code: Optional[int] = None
    response_payload: Any = None
    error_message: Optional[str] = None

    try:
        response = requests.put(
            _api_endpoint(kort_id),
            headers=AUTH_HEADER,
            json=payload,
            timeout=5,
        )
        status_code = response.status_code
        content_type = response.headers.get("Content-Type", "")
        if content_type and "json" in content_type.lower():
            try:
                response_payload = response.json()
            except ValueError:
                response_payload = response.text
        else:
            response_payload = response.text
    except requests.RequestException as exc:
        error_message = str(exc)
        response_payload = {"error": error_message}
        log.error("uno kort=%s command=%s request failed: %s", kort_id, command, exc)

    success = status_code is not None and 200 <= status_code < 300

    safe_response = _safe_copy(response_payload)
    broadcast_extras = extras_copy if isinstance(extras_copy, dict) else extras_copy
    if extras_copy is None:
        log_extras: Optional[Dict[str, Any]] = {
            "uno_status": status_code,
            "uno_response": safe_response,
        }
    else:
        log_extras = dict(extras_copy)
        log_extras["uno_status"] = status_code
        log_extras["uno_response"] = safe_response
    if error_message:
        if log_extras is None:
            log_extras = {"uno_error": error_message}
        else:
            log_extras["uno_error"] = error_message

    with STATE_LOCK:
        state = _ensure_court_state(kort_id)
        if success:
            try:
                _apply_local_command(state, command, value, extras)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "failed to apply local command mirror kort=%s command=%s error=%s",
                    kort_id,
                    command,
                    exc,
                )
        uno_state = state["uno"]
        uno_state["last_command"] = command
        uno_state["last_value"] = value_copy
        uno_state["last_payload"] = payload_copy
        uno_state["last_status"] = status_code
        uno_state["last_response"] = safe_response
        uno_state["updated"] = ts
        state["updated"] = ts
        entry = _record_log_entry(
            state,
            kort_id,
            "uno",
            command,
            value_copy,
            log_extras or None,
            ts,
        )
        response_state = _serialize_court_state(state)

        a_state = state["A"]
        b_state = state["B"]
        log.info("mirror state kort=%s A=%s flag=%s pts=%s sets=(%s,%s) B=%s flag=%s pts=%s sets=(%s,%s) current_set=%s",
                 kort_id,
                 _shorten(a_state.get("full_name") or a_state.get("surname")),
                 _shorten(a_state.get("flag_url") or a_state.get("flag_code")),
                 a_state.get("points"),
                 a_state.get("set1"),
                 a_state.get("set2"),
                 _shorten(b_state.get("full_name") or b_state.get("surname")),
                 _shorten(b_state.get("flag_url") or b_state.get("flag_code")),
                 b_state.get("points"),
                 b_state.get("set1"),
                 b_state.get("set2"),
                 state.get("current_set"))

    _broadcast_kort_state(
        kort_id,
        "uno",
        command,
        value_copy,
        broadcast_extras,
        ts,
        status_code,
    )

    if success:
        log.info("uno kort=%s command=%s status=%s", kort_id, command, status_code)
        return jsonify(
            {
                "ok": True,
                "ts": ts,
                "status": status_code,
                "response": response_payload,
                "state": response_state,
                "log": entry,
            }
        )

    error_text = error_message or (
        f"remote returned status {status_code}" if status_code is not None else "request failed"
    )
    http_status = status_code if status_code and status_code >= 400 else 502
    return (
        jsonify(
            {
                "ok": False,
                "ts": ts,
                "status": status_code,
                "error": error_text,
                "response": response_payload,
                "state": response_state,
                "log": entry,
            }
        ),
        http_status,
    )
