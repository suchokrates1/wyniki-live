"""Walk a page with TalkBack the way a blind person does, and check what it says.

Chrome on an Android emulator with TalkBack on; gestures made on the emulator's own
touchscreen (touch.py: swipe right = next element, double tap = activate); after each gesture the script waits until TalkBack
has spoken and gone quiet, and keeps what it said. TalkBack writes every utterance to
logcat ("Speaking fragment text=…") once its log level is VERBOSE (TalkBack settings →
Advanced → Developer settings → Log output level).

The emulator runs with `-grpc 8554` (touch.py). Swipes drawn with `adb shell input` reach
TalkBack through the software path and it takes them unreliably; the emulator's touchscreen
is a finger to it.

The run is compared with a golden transcript (scripts/talkback/golden/<name>.txt): the
first run is reviewed by a person and accepted with --update; any later difference fails
with the step it happened at. Some rules need no golden: nothing may be "unlabeled", and
a button or link needs a name.

    python scripts/talkback/run.py live                 # compare with the golden transcript
    python scripts/talkback/run.py live --update        # accept this run as the new golden

Needs: one emulator on adb with TalkBack on and VERBOSE logging, and the site reachable
from the emulator (the mock server on the host, `adb reverse tcp:8811 tcp:8811`).
"""
from __future__ import annotations

import argparse
import difflib
import os
import re
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from touch import Finger  # noqa: E402

# the hint TalkBack adds after a pause ("Double-tap to activate"): said or not by timing alone
HINTS = re.compile(r"^(double-tap to activate|double-tap and hold to long press|use two fingers to scroll|"
                   r"kliknij dwukrotnie, aby uaktywnić|kliknij dwukrotnie i przytrzymaj)", re.I)
# the system speaking over the page (a notification), not the page
NOISE = re.compile(r"physical keyboards? configured|skonfigurowano klawiatur", re.I)
SPOKEN = re.compile(r'Speaking fragment text="(.*?)", utteranceId=')
# what TalkBack says when a control has no name, in the languages we may run it in
NAMELESS = re.compile(r"\b(unlabell?ed|nieoznaczon\w*)\b", re.I)
# what TalkBack adds to a name: the role, the state, the place in a list. An utterance made of
# these alone is a control without a name.
ROLE_OR_STATE = re.compile(
    r"^(button|przycisk|link|tab|karta|tab panel|panel karty|tab list|lista kart|list|lista|main|główn\w*|"
    r"navigation|nawigacja|heading \d|nagłówek \d|menu pop up button|przycisk menu\w*|selected|wybran\w*|"
    r"collapsed|zwinięt\w*|expanded|rozwinięt\w*|checked|zaznaczon\w*|not checked|niezaznaczon\w*|"
    r"\d+ (of|z) \d+.*|\d+ (items|element\w*))[,.]?$", re.I)

# TalkBack at the last element of the page: the walk ends here (what follows is Chrome's own bar)
PAGE_END = re.compile(r"nie ma następnego elementu|no next item", re.I)

SCREENS = {
    # name: (address, most steps, text that says the page has loaded, what TalkBack says on its first element)
    "live": ("http://localhost:8811/?lang=pl", 80, "5th Dürener Handicup 2026", "Analityka odwiedzin"),
}


def adb(*args: str) -> str:
    env = {**os.environ, "MSYS_NO_PATHCONV": "1"}
    return subprocess.run(["adb", *args], capture_output=True, text=True, encoding="utf-8", env=env).stdout


class Speech:
    """What TalkBack says, read back from logcat after each gesture.

    logcat streamed through a pipe arrives in late chunks on Windows, so the log is dumped
    again every few hundred ms instead; each utterance has its id (talkback_N), so new
    fragments are told from old ones by that id.
    """

    LINE = re.compile(r'Speaking fragment text="(.*?)", utteranceId=talkback_(\d+)')

    def __init__(self) -> None:
        adb("logcat", "-c")
        self.seen: set[tuple[int, int]] = set()

    def _fragments(self) -> list[tuple[int, int, str]]:
        """(utterance id, position in the log, text) of every fragment in the log, oldest first."""
        out = subprocess.run(["adb", "logcat", "-d", "-v", "brief"], capture_output=True, env={
            **os.environ, "MSYS_NO_PATHCONV": "1"}).stdout.decode("utf-8", "replace")
        found = []
        for index, line in enumerate(out.splitlines()):
            match = self.LINE.search(line)
            if match and not HINTS.match(match.group(1).strip()) and not NOISE.search(match.group(1)):
                found.append((int(match.group(2)), index, match.group(1)))
        return found

    def drain(self) -> None:
        self.seen.update((uid, pos) for uid, pos, _ in self._fragments())

    def collect(self, first_wait: float = 4.0, quiet: float = 1.2, poll: float = 0.3) -> list[str]:
        """Everything said after a gesture: wait for the first words, then until it is quiet."""
        said: list[str] = []
        started = last_new = time.monotonic()
        while True:
            time.sleep(poll)
            fresh = [(uid, pos, text) for uid, pos, text in self._fragments() if (uid, pos) not in self.seen]
            for uid, pos, text in fresh:
                self.seen.add((uid, pos))
                said.append(text)
            now = time.monotonic()
            if fresh:
                last_new = now
            if (said and now - last_new >= quiet) or (not said and now - started >= first_wait):
                return said

    def close(self) -> None:
        pass


def screen_size() -> tuple[int, int]:
    match = re.search(r"(\d+)x(\d+)", adb("shell", "wm", "size"))
    return (int(match.group(1)), int(match.group(2))) if match else (1080, 2400)


def screen_xml() -> str:
    adb("shell", "uiautomator", "dump", "/sdcard/talkback-ui.xml")
    return adb("shell", "cat", "/sdcard/talkback-ui.xml")


def page_shows(text: str) -> bool:
    return text in screen_xml()


def take_new_version(finger: Finger) -> bool:
    """After a new build the page offers "Nowa wersja · Odśwież": press it, as a person would
    (a tap puts TalkBack on it, a double tap presses), so the walk hears the page, not the offer."""
    match = re.search(r'text="(?:Odśwież|Refresh)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', screen_xml())
    if not match:
        return False
    x1, y1, x2, y2 = (int(v) for v in match.groups())
    finger.tap((x1 + x2) // 2, (y1 + y2) // 2)
    time.sleep(1.5)
    finger.double_tap()
    time.sleep(6)
    return True


def walk(url: str, steps: int, ready: str, first: str) -> list[str]:
    """From the first element of the page to its last, one swipe right at a time."""
    finger = Finger()
    speech = Speech()
    adb("shell", "am", "force-stop", "com.android.chrome")
    # one application id: Chrome reuses the same tab run after run instead of opening a new one
    adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url,
        "-e", "com.android.browser.application_id", "talkback-e2e", "com.android.chrome")
    for _ in range(30):
        time.sleep(1)
        if page_shows(ready):
            break
    time.sleep(3)  # the announcements of a page that has just loaded
    if take_new_version(finger):
        for _ in range(30):
            time.sleep(1)
            if page_shows(ready):
                break
        time.sleep(4)  # the old page can still show the text while the new one loads
    width, height = screen_size()
    left = lambda: finger.swipe(width * 5 // 6, height * 7 // 12, width // 5, height * 7 // 12)  # noqa: E731
    right = lambda: finger.swipe(width // 5, height * 7 // 12, width * 5 // 6, height * 7 // 12)  # noqa: E731
    # a finger on the page's header, then swipes until TalkBack is on the page's first element:
    # left from inside the page, right when the focus went up to Chrome's own bar
    finger.tap(width // 6, int(height * 0.13))
    said = speech.collect()
    transcript: list[str] = []
    for move in [left] * 25 + [right] * 30:
        if said and said[0].strip() == first:
            transcript.append(" | ".join(said))
            break
        move()
        said = speech.collect()
    else:
        raise SystemExit(f"nie znalazłem pierwszego elementu strony ({first!r})")
    for _ in range(steps):
        right()
        said = speech.collect()
        if any(PAGE_END.search(part) for part in said):
            transcript.append("(koniec strony)")
            break
        transcript.append(" | ".join(said) or "(cisza)")
    return transcript


def problems(transcript: list[str]) -> list[str]:
    found = []
    for step, line in enumerate(transcript):
        fragments = [part.strip() for part in line.split(" | ") if part.strip()]
        if any(NAMELESS.search(part) for part in fragments):
            found.append(f"krok {step}: element bez nazwy: {line}")
        elif fragments and line != "(cisza)" and all(ROLE_OR_STATE.match(part) for part in fragments):
            found.append(f"krok {step}: sama rola, bez nazwy: {line}")
    return found


def names(line: str) -> str:
    """What an element is called, without the role and state TalkBack adds (and says, or not, by timing)."""
    return " | ".join(part.strip() for part in line.split(" | ") if part.strip() and not ROLE_OR_STATE.match(part.strip()))


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # the Windows console would mangle ą, ż, ł
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("screen", choices=sorted(SCREENS))
    parser.add_argument("--update", action="store_true", help="accept this run as the golden transcript")
    parser.add_argument("--steps", type=int, help="how many swipes (default: the screen's own)")
    args = parser.parse_args()

    url, steps, ready, first = SCREENS[args.screen]
    transcript = walk(url, args.steps or steps, ready, first)
    out = HERE / "runs" / f"{args.screen}-{time.strftime('%Y%m%d-%H%M%S')}.txt"
    out.parent.mkdir(exist_ok=True)
    numbered = [f"{i:03d}  {line}" for i, line in enumerate(transcript)]
    out.write_text("\n".join(numbered) + "\n", encoding="utf-8")
    print("\n".join(numbered))
    print(f"\nzapis: {out}")

    issues = problems(transcript)
    for issue in issues:
        print("BŁĄD:", issue)

    golden = HERE / "golden" / f"{args.screen}.txt"
    if args.update:
        golden.parent.mkdir(exist_ok=True)
        golden.write_text("\n".join(numbered) + "\n", encoding="utf-8")
        print(f"wzorzec zapisany: {golden}")
        return 1 if issues else 0
    if not golden.exists():
        print("brak wzorca: przejrzyj zapis i uruchom z --update")
        return 1
    # compared by names and order; the full lines (roles included) stay in both files to read
    expected = [names(line.split("  ", 1)[1]) for line in golden.read_text(encoding="utf-8").splitlines()]
    diff = list(difflib.unified_diff(expected, [names(line) for line in transcript],
                                     "wzorzec", "ten przebieg", lineterm="", n=1))
    for line in diff:
        print(line)
    return 1 if (diff or issues) else 0


if __name__ == "__main__":
    sys.exit(main())
