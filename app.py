#!/usr/bin/env python3
import os, json, time, threading, sqlite3, logging, random, re
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import requests
from flask import Flask, jsonify, send_from_directory, request, redirect, abort

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
JITTER = 0.12

# Interwały odpytywania (s) – zachowawcze vs. limity UNO
INTERVALS = {
    "POINTS": 7.0,
    "GAMES": 60.0,
    "NAMES": 120.0,
    "VIS": 60.0,
    "TIE": 7.0,       # punkty tiebreak gdy aktywny
    "TIEVIS": 15.0,   # widoczność tiebreak
    "CURSET": 30.0    # numer bieżącego seta
}

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
snapshots: Dict[str, Dict[str, Any]] = {
    k: {
        "overlay_visible": None,
        "A": {"surname": "-", "points": "-", "set1": 0, "set2": 0},
        "B": {"surname": "-", "points": "-", "set1": 0, "set2": 0},
        "tie": {"visible": None, "A": 0, "B": 0},   # super tiebreak
        "current_set": None,                        # numer seta wg UNO (1..)
        "updated": None
    }
    for k in OVERLAY_IDS.keys()
}

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

def _uno_call(kort_id: str, command: str, value: Any = None) -> Optional[requests.Response]:
    if not OVERLAY_IDS.get(kort_id): return None
    if not buckets[kort_id].take(): return None
    body = {"command": command}
    if value is not None: body["value"] = value
    try:
        return requests.put(_api_endpoint(kort_id), headers=AUTH_HEADER, json=body, timeout=5)
    except requests.RequestException as e:
        log.warning("UNO error kort=%s cmd=%s err=%s", kort_id, command, e)
        return None

def _to_bool(val):
    if isinstance(val, bool): return val
    if isinstance(val, (int, float)): return val != 0
    if val is None: return None
    s = str(val).strip().lower()
    if s in ("true","1","yes","on","visible","show","shown","active","enabled"): return True
    if s in ("false","0","no","off","hidden","hide","invisible","inactive","disabled"): return False
    return None

def _parse_visibility_body(body: str):
    try:
        data = json.loads(body)
        if isinstance(data, dict):
            if "payload" in data: return _to_bool(data["payload"])
            for k in ("visible","isVisible","visibility","value","status"):
                if k in data:
                    b = _to_bool(data[k]); 
                    if b is not None: return b
    except Exception:
        pass
    return _to_bool(body)

def _parse_int_payload(text: str, default: int = 0) -> int:
    try:
        data = json.loads(text)
        if isinstance(data, dict) and "payload" in data:
            return int(str(data["payload"]).strip())
    except Exception:
        pass
    m = re.findall(r"-?\d+", text.strip())
    return int(m[0]) if m else default

def _update_and_archive(kort_id: str, new: Dict[str, Any]):
    old = snapshots[kort_id]
    changed = False

    if "overlay_visible" in new:
        vis = new["overlay_visible"]
        if vis is not None and vis != old["overlay_visible"]:
            old["overlay_visible"] = bool(vis)
            changed = True

    # aktualizacje A/B (nazwisko/punkty/sety)
    for side in ("A", "B"):
        if side in new:
            for key in ("surname", "points", "set1", "set2"):
                if key in new[side] and new[side][key] != old[side][key]:
                    old[side][key] = new[side][key]
                    changed = True

    # tiebreak
    if "tie" in new:
        tnew = new["tie"]
        told = old["tie"]
        for key in ("visible", "A", "B"):
            if key in tnew and tnew[key] != told[key]:
                told[key] = tnew[key]
                changed = True

    # numer bieżącego seta (z UNO)
    if "current_set" in new and new["current_set"] != old.get("current_set"):
        old["current_set"] = new["current_set"]
        changed = True

    if changed:
        old["updated"] = _now_iso()
        # Archiwizujemy tylko klasyczne pola (nazwiska/punkty/gemy/visibility)
        con = db_conn()
        cur = con.cursor()
        vis_db = -1 if old["overlay_visible"] is None else (1 if old["overlay_visible"] else 0)
        cur.execute(
            "INSERT INTO snapshot_meta (ts, kort_id, overlay_visible) VALUES (?, ?, ?)",
            (old["updated"], kort_id, vis_db)
        )
        for side in ("A", "B"):
            cur.execute(
                "INSERT INTO snapshots (ts, kort_id, player, surname, points, set1, set2)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (old["updated"], kort_id, side, old[side]["surname"], str(old[side]["points"]),
                 int(old[side]["set1"] or 0), int(old[side]["set2"] or 0))
            )
        con.commit()
        con.close()

# ====== Poller ======
def poller():
    clocks: Dict[str, Dict[str, float]] = {
        k: {
            "nameA":0.0,"nameB":0.0,
            "ptsA":0.0,"ptsB":0.0,
            "set1A":0.0,"set1B":0.0,"set2A":0.0,"set2B":0.0,
            "vis":0.0,
            "tieVis":0.0,"tieA":0.0,"tieB":0.0,
            "curSet":0.0
        } for k in OVERLAY_IDS.keys()
    }
    while True:
        now = time.monotonic()
        for kort_id in OVERLAY_IDS.keys():
            # overlay visibility
            if now >= clocks[kort_id]["vis"]:
                r = _uno_call(kort_id, "GetOverlayVisibility")
                if r is not None and r.ok:
                    b = _parse_visibility_body(r.text)
                    if b is not None:
                        _update_and_archive(kort_id, {"overlay_visible": b})
                clocks[kort_id]["vis"] = now + INTERVALS["VIS"] + random.uniform(0, JITTER)

            # names
            if now >= clocks[kort_id]["nameA"]:
                r = _uno_call(kort_id, "GetNamePlayerA")
                if r is not None and r.ok:
                    try: payload = json.loads(r.text).get("payload", "")
                    except Exception: payload = r.text
                    _update_and_archive(kort_id, {"A": {"surname": _surname(payload)}})
                clocks[kort_id]["nameA"] = now + INTERVALS["NAMES"] + random.uniform(0, JITTER)
            if now >= clocks[kort_id]["nameB"]:
                r = _uno_call(kort_id, "GetNamePlayerB")
                if r is not None and r.ok:
                    try: payload = json.loads(r.text).get("payload", "")
                    except Exception: payload = r.text
                    _update_and_archive(kort_id, {"B": {"surname": _surname(payload)}})
                clocks[kort_id]["nameB"] = now + INTERVALS["NAMES"] + random.uniform(0, JITTER)

            # points
            if now >= clocks[kort_id]["ptsA"]:
                r = _uno_call(kort_id, "GetPointsPlayerA")
                if r is not None and r.ok:
                    try: p = json.loads(r.text).get("payload", "-")
                    except Exception: p = r.text.strip()
                    _update_and_archive(kort_id, {"A": {"points": str(p)}})
                clocks[kort_id]["ptsA"] = now + INTERVALS["POINTS"] + random.uniform(0, JITTER)
            if now >= clocks[kort_id]["ptsB"]:
                r = _uno_call(kort_id, "GetPointsPlayerB")
                if r is not None and r.ok:
                    try: p = json.loads(r.text).get("payload", "-")
                    except Exception: p = r.text.strip()
                    _update_and_archive(kort_id, {"B": {"points": str(p)}})
                clocks[kort_id]["ptsB"] = now + INTERVALS["POINTS"] + random.uniform(0, JITTER)

            # games set1
            if now >= clocks[kort_id]["set1A"]:
                r = _uno_call(kort_id, "GetSet1PlayerA")
                if r is not None and r.ok:
                    v = _parse_int_payload(r.text, 0)
                    _update_and_archive(kort_id, {"A": {"set1": int(v or 0)}})
                clocks[kort_id]["set1A"] = now + INTERVALS["GAMES"] + random.uniform(0, JITTER)
            if now >= clocks[kort_id]["set1B"]:
                r = _uno_call(kort_id, "GetSet1PlayerB")
                if r is not None and r.ok:
                    v = _parse_int_payload(r.text, 0)
                    _update_and_archive(kort_id, {"B": {"set1": int(v or 0)}})
                clocks[kort_id]["set1B"] = now + INTERVALS["GAMES"] + random.uniform(0, JITTER)

            # games set2
            if now >= clocks[kort_id]["set2A"]:
                r = _uno_call(kort_id, "GetSet2PlayerA")
                if r is not None and r.ok:
                    v = _parse_int_payload(r.text, 0)
                    _update_and_archive(kort_id, {"A": {"set2": int(v or 0)}})
                clocks[kort_id]["set2A"] = now + INTERVALS["GAMES"] + random.uniform(0, JITTER)
            if now >= clocks[kort_id]["set2B"]:
                r = _uno_call(kort_id, "GetSet2PlayerB")
                if r is not None and r.ok:
                    v = _parse_int_payload(r.text, 0)
                    _update_and_archive(kort_id, {"B": {"set2": int(v or 0)}})
                clocks[kort_id]["set2B"] = now + INTERVALS["GAMES"] + random.uniform(0, JITTER)

            # super tie-break visibility
            if now >= clocks[kort_id]["tieVis"]:
                r = _uno_call(kort_id, "GetTieBreakVisibility")
                if r is not None and r.ok:
                    b = _parse_visibility_body(r.text)
                    _update_and_archive(kort_id, {"tie": {"visible": b}})
                clocks[kort_id]["tieVis"] = now + INTERVALS["TIEVIS"] + random.uniform(0, JITTER)

            # super tie-break points (gdy aktywny, pytamy częściej)
            tie_on = snapshots[kort_id]["tie"]["visible"] is True
            tie_interval = INTERVALS["TIE"] if tie_on else INTERVALS["GAMES"]
            if now >= clocks[kort_id]["tieA"]:
                r = _uno_call(kort_id, "GetTieBreakPlayerA")
                if r is not None and r.ok:
                    v = _parse_int_payload(r.text, 0)
                    _update_and_archive(kort_id, {"tie": {"A": int(v or 0)}})
                clocks[kort_id]["tieA"] = now + tie_interval + random.uniform(0, JITTER)
            if now >= clocks[kort_id]["tieB"]:
                r = _uno_call(kort_id, "GetTieBreakPlayerB")
                if r is not None and r.ok:
                    v = _parse_int_payload(r.text, 0)
                    _update_and_archive(kort_id, {"tie": {"B": int(v or 0)}})
                clocks[kort_id]["tieB"] = now + tie_interval + random.uniform(0, JITTER)

            # numer bieżącego seta
            if now >= clocks[kort_id]["curSet"]:
                r = _uno_call(kort_id, "GetSet")
                if r is not None and r.ok:
                    v = _parse_int_payload(r.text, None)
                    if v is not None:
                        _update_and_archive(kort_id, {"current_set": int(v)})
                clocks[kort_id]["curSet"] = now + INTERVALS["CURSET"] + random.uniform(0, JITTER)

        time.sleep(0.15)

def start_background():
    t = threading.Thread(target=poller, name="poller", daemon=True)
    t.start()

# ====== API ======
@app.route("/api/snapshot")
def api_snapshot():
    return jsonify({
        kort: {
            "overlay_visible": s["overlay_visible"],
            "A": s["A"], "B": s["B"],
            "tie": s["tie"],
            "current_set": s["current_set"],
            "updated": s["updated"],
        } for kort, s in snapshots.items()
    })

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

# ====== Start pollera ======
start_background()
