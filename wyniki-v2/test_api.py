#!/usr/bin/env python3
import requests
import json

url = "http://127.0.0.1:8088/api/events"
data = {
    "court_id": "1",
    "pin": "0000",
    "event_type": "point",
    "player1": {"name": "Kowalski", "serving": True},
    "player2": {"name": "Nowak", "serving": False},
    "score": {
        "points": {"player1": "15", "player2": "0"},
        "games": {"player1": 0, "player2": 0},
        "sets": {},
        "current_set": 1
    }
}

try:
    r = requests.post(url, json=data, timeout=5)
    print(f"Status: {r.status_code}")
    print(f"Response: {r.text}")
except Exception as e:
    print(f"Error: {e}")
