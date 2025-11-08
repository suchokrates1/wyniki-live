"""
Mock UNO API Server for realistic testing
Simulates overlays.uno API responses with realistic tennis match progression
"""
from flask import Flask, request, jsonify
import logging
import time
from typing import Dict, Any, Optional
from threading import Lock

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s [MOCK-UNO] %(message)s')
log = logging.getLogger(__name__)

# Mock state for 4 courts
COURTS: Dict[str, Dict[str, Any]] = {}
COURTS_LOCK = Lock()

# Request counters
REQUEST_COUNTS: Dict[str, Dict[str, int]] = {}
REQUEST_TIMES: list = []

def get_court_state(overlay_id: str) -> Dict[str, Any]:
    """Get or create court state"""
    with COURTS_LOCK:
        if overlay_id not in COURTS:
            COURTS[overlay_id] = {
                "overlay_visible": False,
                "points": {"A": "0", "B": "0"},
                "current_games": {"A": 0, "B": 0},
                "sets": {
                    "set1": {"A": 0, "B": 0},
                    "set2": {"A": 0, "B": 0},
                },
                "tie": {"A": 0, "B": 0, "visible": False},
                "names": {"A": "", "B": ""},
                "serve": "A",
                "match_started": False,
                "points_sequence": 0,  # For simulation
            }
            REQUEST_COUNTS[overlay_id] = {}
        return COURTS[overlay_id]

def count_request(overlay_id: str, command: str):
    """Count API requests per court per command"""
    with COURTS_LOCK:
        if overlay_id not in REQUEST_COUNTS:
            REQUEST_COUNTS[overlay_id] = {}
        REQUEST_COUNTS[overlay_id][command] = REQUEST_COUNTS[overlay_id].get(command, 0) + 1
        REQUEST_TIMES.append({
            "time": time.time(),
            "overlay": overlay_id,
            "command": command
        })

def simulate_point_progression(state: Dict[str, Any]):
    """Simulate realistic point progression"""
    seq = state["points_sequence"]
    
    # Point progression: 0 -> 15 -> 30 -> 40 -> game
    # We'll alternate winners for realism
    point_values = ["0", "15", "30", "40"]
    
    a_pts = state["points"]["A"]
    b_pts = state["points"]["B"]
    
    # Simulate point by point (alternate winners mostly)
    if seq % 2 == 0:
        # Player A wins point
        if a_pts == "40" and b_pts != "40" and b_pts != "ADV":
            # A wins game
            state["current_games"]["A"] += 1
            state["points"]["A"] = "0"
            state["points"]["B"] = "0"
            state["serve"] = "B" if state["serve"] == "A" else "A"
            check_set_winner(state)
        elif a_pts == "40" and b_pts == "40":
            state["points"]["A"] = "ADV"
            state["points"]["B"] = "40"
        elif a_pts == "ADV":
            # A wins game from advantage
            state["current_games"]["A"] += 1
            state["points"]["A"] = "0"
            state["points"]["B"] = "0"
            state["serve"] = "B" if state["serve"] == "A" else "A"
            check_set_winner(state)
        elif b_pts == "ADV":
            # Back to deuce
            state["points"]["A"] = "40"
            state["points"]["B"] = "40"
        else:
            # Normal progression
            idx = point_values.index(a_pts) if a_pts in point_values else 0
            state["points"]["A"] = point_values[min(idx + 1, 3)]
    else:
        # Player B wins point
        if b_pts == "40" and a_pts != "40" and a_pts != "ADV":
            state["current_games"]["B"] += 1
            state["points"]["A"] = "0"
            state["points"]["B"] = "0"
            state["serve"] = "B" if state["serve"] == "A" else "A"
            check_set_winner(state)
        elif b_pts == "40" and a_pts == "40":
            state["points"]["B"] = "ADV"
            state["points"]["A"] = "40"
        elif b_pts == "ADV":
            state["current_games"]["B"] += 1
            state["points"]["A"] = "0"
            state["points"]["B"] = "0"
            state["serve"] = "B" if state["serve"] == "A" else "A"
            check_set_winner(state)
        elif a_pts == "ADV":
            state["points"]["A"] = "40"
            state["points"]["B"] = "40"
        else:
            idx = point_values.index(b_pts) if b_pts in point_values else 0
            state["points"]["B"] = point_values[min(idx + 1, 3)]
    
    state["points_sequence"] += 1

def check_set_winner(state: Dict[str, Any]):
    """Check if someone won the set"""
    a_games = state["current_games"]["A"]
    b_games = state["current_games"]["B"]
    
    # Normal set win: 6+ games and 2+ ahead
    if a_games >= 6 and a_games - b_games >= 2:
        # A wins set
        if state["sets"]["set1"]["A"] == 0 and state["sets"]["set1"]["B"] == 0:
            state["sets"]["set1"]["A"] = a_games
            state["sets"]["set1"]["B"] = b_games
        else:
            state["sets"]["set2"]["A"] = a_games
            state["sets"]["set2"]["B"] = b_games
            # Match over
            state["overlay_visible"] = False
        state["current_games"]["A"] = 0
        state["current_games"]["B"] = 0
    elif b_games >= 6 and b_games - a_games >= 2:
        # B wins set
        if state["sets"]["set1"]["A"] == 0 and state["sets"]["set1"]["B"] == 0:
            state["sets"]["set1"]["A"] = a_games
            state["sets"]["set1"]["B"] = b_games
        else:
            state["sets"]["set2"]["A"] = a_games
            state["sets"]["set2"]["B"] = b_games
            state["overlay_visible"] = False
        state["current_games"]["A"] = 0
        state["current_games"]["B"] = 0
    elif a_games == 6 and b_games == 6:
        # Tie-break (simplified: just set to 7-6)
        state["tie"]["visible"] = True
        state["tie"]["A"] = 7
        state["tie"]["B"] = 5
        state["sets"]["set1"]["A"] = 7
        state["sets"]["set1"]["B"] = 6
        state["current_games"]["A"] = 0
        state["current_games"]["B"] = 0
        state["tie"]["visible"] = False

@app.route('/apiv2/controlapps/<overlay_id>/api', methods=['GET', 'PUT', 'POST'])
def uno_api(overlay_id: str):
    """Main UNO API endpoint"""
    state = get_court_state(overlay_id)
    
    if request.method == 'GET':
        # Return full state (not used in our system)
        return jsonify(state)
    
    payload = request.get_json(silent=True) or {}
    command = payload.get('command', '')
    value = payload.get('value')
    
    count_request(overlay_id, command)
    
    log.info(f"Court {overlay_id[-1]}: {command} = {value}")
    
    # Handle GET commands (polling)
    if command == "GetTieBreakVisibility":
        return jsonify({"value": state["tie"]["visible"]})
    
    elif command == "GetPointsPlayerA":
        # Simulate match progression
        if state["match_started"] and state["overlay_visible"]:
            simulate_point_progression(state)
        return jsonify({"value": state["points"]["A"]})
    
    elif command == "GetPointsPlayerB":
        return jsonify({"value": state["points"]["B"]})
    
    elif command == "GetCurrentSetPlayerA":
        return jsonify({"value": state["current_games"]["A"]})
    
    elif command == "GetCurrentSetPlayerB":
        return jsonify({"value": state["current_games"]["B"]})
    
    elif command == "GetSet1PlayerA":
        return jsonify({"value": state["sets"]["set1"]["A"]})
    
    elif command == "GetSet1PlayerB":
        return jsonify({"value": state["sets"]["set1"]["B"]})
    
    elif command == "GetSet2PlayerA":
        return jsonify({"value": state["sets"]["set2"]["A"]})
    
    elif command == "GetSet2PlayerB":
        return jsonify({"value": state["sets"]["set2"]["B"]})
    
    elif command == "GetTieBreakPlayerA":
        return jsonify({"value": state["tie"]["A"]})
    
    elif command == "GetTieBreakPlayerB":
        return jsonify({"value": state["tie"]["B"]})
    
    elif command == "GetNamePlayerA":
        return jsonify({"value": state["names"]["A"]})
    
    elif command == "GetNamePlayerB":
        return jsonify({"value": state["names"]["B"]})
    
    # Handle SET commands (from admin or plugin)
    elif command == "SetTieBreakVisibility":
        with COURTS_LOCK:
            state["overlay_visible"] = bool(value)
            if value:
                state["match_started"] = True
        return jsonify({"success": True})
    
    elif command.startswith("SetName"):
        side = "A" if "PlayerA" in command else "B"
        with COURTS_LOCK:
            state["names"][side] = str(value or "")
        return jsonify({"success": True})
    
    elif command.startswith("SetPoints"):
        # Accept manual point changes (from admin)
        side = "A" if "PlayerA" in command else "B"
        with COURTS_LOCK:
            state["points"][side] = str(value or "0")
        return jsonify({"success": True})
    
    elif command.startswith("SetCurrentSet"):
        side = "A" if "PlayerA" in command else "B"
        with COURTS_LOCK:
            state["current_games"][side] = int(value or 0)
        return jsonify({"success": True})
    
    elif command.startswith("SetSet1"):
        side = "A" if "PlayerA" in command else "B"
        with COURTS_LOCK:
            state["sets"]["set1"][side] = int(value or 0)
        return jsonify({"success": True})
    
    elif command.startswith("SetSet2"):
        side = "A" if "PlayerA" in command else "B"
        with COURTS_LOCK:
            state["sets"]["set2"][side] = int(value or 0)
        return jsonify({"success": True})
    
    else:
        return jsonify({"error": "unknown command"}), 400

@app.route('/stats')
def stats():
    """Show request statistics"""
    with COURTS_LOCK:
        total = sum(sum(counts.values()) for counts in REQUEST_COUNTS.values())
        
        # Calculate requests per second
        if REQUEST_TIMES:
            start_time = REQUEST_TIMES[0]["time"]
            end_time = REQUEST_TIMES[-1]["time"]
            duration = end_time - start_time
            rps = len(REQUEST_TIMES) / duration if duration > 0 else 0
        else:
            duration = 0
            rps = 0
        
        return jsonify({
            "total_requests": total,
            "duration_seconds": round(duration, 2),
            "requests_per_second": round(rps, 2),
            "by_court": REQUEST_COUNTS,
            "courts_state": {k: {
                "visible": v["overlay_visible"],
                "points": f"{v['points']['A']}-{v['points']['B']}",
                "games": f"{v['current_games']['A']}-{v['current_games']['B']}",
                "set1": f"{v['sets']['set1']['A']}-{v['sets']['set1']['B']}",
            } for k, v in COURTS.items()}
        })

@app.route('/reset')
def reset():
    """Reset all statistics"""
    with COURTS_LOCK:
        COURTS.clear()
        REQUEST_COUNTS.clear()
        REQUEST_TIMES.clear()
    return jsonify({"ok": True})

if __name__ == '__main__':
    log.info("🎾 Mock UNO API Server starting on http://localhost:5001")
    log.info("Stats available at: http://localhost:5001/stats")
    app.run(host='0.0.0.0', port=5001, debug=False, threaded=True)
