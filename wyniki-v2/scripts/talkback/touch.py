"""Touches as the emulator's own touchscreen makes them (its gRPC control port), so TalkBack
gets them exactly like a finger's. `adb shell input` goes in through the software path, and
TalkBack takes those touches unreliably (a few swipes, then nothing).

The emulator must run with `-grpc 8554`. The Python stubs are built on first use from the
.proto the Android SDK ships (emulator/lib/emulator_controller.proto) into a cache folder.
"""
from __future__ import annotations

import importlib
import os
import subprocess
import sys
import time
from pathlib import Path

CACHE = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "talkback-e2e-grpc"
PROTO = Path(os.environ.get("LOCALAPPDATA", "")) / "Android" / "Sdk" / "emulator" / "lib" / "emulator_controller.proto"


def _stubs():
    CACHE.mkdir(parents=True, exist_ok=True)
    if not (CACHE / "emulator_controller_pb2_grpc.py").exists():
        (CACHE / PROTO.name).write_bytes(PROTO.read_bytes())
        subprocess.run([sys.executable, "-m", "grpc_tools.protoc", f"-I{CACHE}", f"--python_out={CACHE}",
                        f"--grpc_python_out={CACHE}", str(CACHE / PROTO.name)], check=True)
    sys.path.insert(0, str(CACHE))
    return importlib.import_module("emulator_controller_pb2"), importlib.import_module("emulator_controller_pb2_grpc")


class Finger:
    """One finger on the emulator's screen, in screen pixels."""

    def __init__(self, address: str = "localhost:8554") -> None:
        import grpc

        self.pb, rpc = _stubs()
        self.stub = rpc.EmulatorControllerStub(grpc.insecure_channel(address))

    def _touch(self, x: int, y: int, pressure: int) -> None:
        touch = self.pb.Touch(x=int(x), y=int(y), identifier=0, pressure=pressure, touch_major=6, touch_minor=6)
        self.stub.sendTouch(self.pb.TouchEvent(touches=[touch]))

    def swipe(self, x1: int, y1: int, x2: int, y2: int, ms: int = 220, steps: int = 12) -> None:
        """Down, a straight even path, up: what TalkBack reads as a swipe."""
        pause = ms / 1000 / steps
        self._touch(x1, y1, 1024)
        for i in range(1, steps + 1):
            time.sleep(pause)
            self._touch(x1 + (x2 - x1) * i // steps, y1 + (y2 - y1) * i // steps, 1024)
        self._touch(x2, y2, 0)

    def tap(self, x: int, y: int) -> None:
        self._touch(x, y, 1024)
        time.sleep(0.06)
        self._touch(x, y, 0)

    def double_tap(self, x: int = 540, y: int = 1200) -> None:
        """TalkBack's "activate": two quick taps anywhere act on the focused element."""
        self.tap(x, y)
        time.sleep(0.12)
        self.tap(x, y)
