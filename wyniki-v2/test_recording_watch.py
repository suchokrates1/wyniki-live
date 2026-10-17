"""The recording watch: when a camera's file stops growing, when it never starts, and one message
when every camera stops at once. Time and file sizes are simulated."""
import importlib.util
import sys
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("recording_watch", Path(__file__).parent / "scripts" / "recording_watch.py")
rw = importlib.util.module_from_spec(SPEC)
sys.modules["recording_watch"] = rw  # dataclasses look their module up while the class is built
SPEC.loader.exec_module(rw)


def _watch(*names, stall=180, startup=600):
    return rw.Watch([rw.Camera(name) for name in names], stall, startup, started=0)


def _step(watch, now, sizes):
    """sizes: camera name -> (file name, size) or None for no file."""
    for camera in watch.cameras:
        seen = sizes.get(camera.name)
        rw.observe(camera, Path(seen[0]) if seen else None, seen[1] if seen else -1, now)
    return rw.assess(watch, now)


def test_yesterdays_files_alone_raise_nothing():
    watch = _watch("Kamera 1", "Kamera 2")
    old = {"Kamera 1": ("Kamera 1- old.mkv", 500), "Kamera 2": ("Kamera 2- old.mkv", 700)}
    for now in range(0, 900, 60):
        assert _step(watch, now, old) == []


def test_a_camera_that_stops_is_reported_once_and_again_when_it_records():
    watch = _watch("Kamera 1", "Kamera 2")
    said = []
    for minute in range(12):
        k1 = ("Kamera 1- a.mkv", 100 * minute)
        k2 = ("Kamera 2- a.mkv", 100 * min(minute, 3) if minute < 9 else 100 * minute)  # stops at 3, back at 9
        said += _step(watch, minute * 60, {"Kamera 1": k1, "Kamera 2": k2})
    assert said == ["Kamera 2: plik nie rośnie od 3 min (Kamera 2- a.mkv).", "Kamera 2: znów nagrywa."]


def test_a_new_hourly_file_counts_as_growth():
    watch = _watch("Kamera 1")
    said = []
    for minute in range(6):
        name = "Kamera 1- 10.mkv" if minute < 3 else "Kamera 1- 11.mkv"
        size = 1000 if minute >= 1 and minute < 3 else (10 if minute >= 3 else 500)
        said += _step(watch, minute * 60, {"Kamera 1": (name, size + minute)})
    assert said == []


def test_a_camera_that_never_starts_is_named_after_the_startup_time():
    watch = _watch("Kamera 1", "Kamera 4", startup=300)
    said = []
    for minute in range(8):
        said += _step(watch, minute * 60, {"Kamera 1": ("Kamera 1- a.mkv", 100 * minute)})
    assert said == ["Kamera 4: nie nagrywa od startu (brak rosnącego pliku)."]


def test_every_camera_stopping_at_once_is_one_message():
    watch = _watch("Kamera 1", "Kamera 2")
    said = []
    for minute in range(10):
        size = 100 * min(minute, 4)
        said += _step(watch, minute * 60, {"Kamera 1": ("Kamera 1- a.mkv", size), "Kamera 2": ("Kamera 2- a.mkv", size)})
    assert said == ["Nagrywanie stoi na wszystkich kamerach od 3 min (koniec dnia?)."]
