"""Watches OBS's per-camera recordings on the production laptop and sends a WhatsApp alert when one
stops. In Vilnius camera 4 stopped after 7 minutes on day 4 and camera 5 lost 15 minutes; both came
to light a month later.

OBS's Source Record filter writes each camera to D:/Nagrania as "Kamera N- <date time>.mkv", a new
file every hour. Each minute the newest file of each camera is checked:
- a camera that was recording and whose file has not grown for --stall seconds: an alert, and
  another when it records again;
- a camera with no growing file --startup seconds after the others began: "not recording";
- every camera stopping at once (recording stopped for the day): one message, not one per camera.

The message goes out through the server's WhatsApp set-up (wyniki.services.owner_alert, to the
umpire SOS recipients) over SSH, so this laptop holds no WAHA key. Without a connection it beeps
and writes the alert here and to _watch_log.txt in the recordings folder.

    python scripts/recording_watch.py                 # Kamera 1..6 in D:/Nagrania
    python scripts/recording_watch.py --cameras "Kamera 1,Kamera 2,Kamera 3" --stall 120
"""
from __future__ import annotations

import argparse
import shlex
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path


@dataclass
class Camera:
    name: str
    path: Path | None = None
    size: int = -1
    grew_at: float | None = None  # last time its newest file grew (None: not seen recording yet)
    began_at: float | None = None # first growth seen: when it started recording in this watch
    stalled: bool = False         # an alert about it is standing


@dataclass
class Watch:
    cameras: list[Camera]
    stall: float
    startup: float
    started: float = field(default_factory=time.monotonic)
    all_stopped: bool = False
    never_started: set[str] = field(default_factory=set)


def newest_file(folder: Path, camera: str) -> Path | None:
    files = [p for p in folder.glob(f"{camera}- *") if p.is_file()]
    return max(files, key=lambda p: p.stat().st_mtime) if files else None


def observe(camera: Camera, path: Path | None, size: int, now: float) -> None:
    """Note what the folder shows for one camera: a new file or a bigger one is growth. The first
    look only takes stock, so yesterday's last file does not count as recording."""
    if path is None:
        return
    if camera.size >= 0 and (path != camera.path or size > camera.size):
        camera.grew_at = now
        if camera.began_at is None:
            camera.began_at = now
    camera.path, camera.size = path, size


def assess(watch: Watch, now: float) -> list[str]:
    """The messages this check calls for (already-sent alerts are not repeated)."""
    messages: list[str] = []
    recording = [c for c in watch.cameras if c.grew_at is not None]
    stopped = [c for c in recording if now - c.grew_at >= watch.stall]
    if recording and len(stopped) == len(recording) == len(watch.cameras):
        if not watch.all_stopped:
            watch.all_stopped = True
            messages.append(f"Nagrywanie stoi na wszystkich kamerach od {int(watch.stall // 60)} min (koniec dnia?).")
        for camera in stopped:
            camera.stalled = True
        return messages
    if watch.all_stopped and len(stopped) < len(recording):
        watch.all_stopped = False
    for camera in recording:
        if camera in stopped and not camera.stalled:
            camera.stalled = True
            messages.append(f"{camera.name}: plik nie rośnie od {int((now - camera.grew_at) // 60)} min ({camera.path.name if camera.path else '-'}).")
        elif camera not in stopped and camera.stalled:
            camera.stalled = False
            messages.append(f"{camera.name}: znów nagrywa.")
    first = min((c.began_at for c in recording if c.began_at is not None), default=None)
    if first is not None and now - first >= watch.startup:
        for camera in watch.cameras:
            if camera.grew_at is None and camera.name not in watch.never_started:
                watch.never_started.add(camera.name)
                messages.append(f"{camera.name}: nie nagrywa od startu (brak rosnącego pliku).")
    return messages


def send(text: str, host: str, container: str, log: Path) -> None:
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    command = ["ssh", "-o", "ConnectTimeout=10", "-o", "BatchMode=yes", host,
               "docker", "exec", container, "python", "-m", "wyniki.services.owner_alert", shlex.quote(text)]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=40)
        delivered = result.returncode == 0
    except (OSError, subprocess.SubprocessError):
        delivered = False
    line = f"{stamp}  {'wysłane' if delivered else 'NIE WYSŁANE'}  {text}"
    print(line, flush=True)
    try:
        with log.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except OSError:
        pass
    if not delivered:
        try:
            import winsound
            for _ in range(3):
                winsound.Beep(1200, 400)
        except (ImportError, RuntimeError):
            print("\a", end="", flush=True)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--dir", default="D:/Nagrania", help="where OBS's Source Record writes")
    parser.add_argument("--cameras", default=",".join(f"Kamera {n}" for n in range(1, 7)))
    parser.add_argument("--stall", type=float, default=180, help="seconds without growth before an alert")
    parser.add_argument("--startup", type=float, default=600, help="seconds after the first camera before 'not recording'")
    parser.add_argument("--interval", type=float, default=60)
    parser.add_argument("--host", default="minipc")
    parser.add_argument("--container", default="wyniki-tenis-v2")
    parser.add_argument("--test-alert", action="store_true", help="send one test message and exit")
    args = parser.parse_args()

    folder = Path(args.dir)
    log = folder / "_watch_log.txt"
    if args.test_alert:
        send("Test alarmu nagrywania z laptopa produkcyjnego.", args.host, args.container, log)
        return 0
    watch = Watch([Camera(name.strip()) for name in args.cameras.split(",") if name.strip()], args.stall, args.startup)
    print(f"Pilnuję {', '.join(c.name for c in watch.cameras)} w {folder} (alarm po {int(args.stall)} s bez przyrostu). Ctrl+C kończy.", flush=True)
    while True:
        now = time.monotonic()
        for camera in watch.cameras:
            path = newest_file(folder, camera.name)
            size = path.stat().st_size if path and path.exists() else -1
            observe(camera, path, size, now)
        for message in assess(watch, now):
            send(message, args.host, args.container, log)
        time.sleep(args.interval)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
