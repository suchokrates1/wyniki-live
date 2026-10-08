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
HINTS = re.compile(r"^(double-tap to (activate|toggle|edit text)|double-tap and hold to long press|"
                   r"use two fingers to scroll|kliknij dwukrotnie, aby (uaktywnić|przełączyć|edytować tekst)|"
                   r"kliknij dwukrotnie i przytrzymaj|"
                   # the language list's name: TalkBack says it as the list's hint, after a pause
                   r"wybierz język$|choose language$)", re.I)
# a text field: TalkBack says its name (and placeholder) only after a pause, as the field's hint
TEXT_FIELD = re.compile(r"\b(pole tekstowe|pole edycji|edit box|search field)\b", re.I)
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
    r"column header|nagłówek kolumny|toggle button|przycisk przełączania|disclosure triangle|trójkąt rozwinięcia|"
    r"collapsed|zwinięt\w*|expanded|rozwinięt\w*|checked|zaznaczon\w*|not checked|niezaznaczon\w*|"
    r"((lista|list),\s*)+(lista|list)?|(widok )?(zwinięty|rozwinięty)|wyskakujący przycisk otwierający menu|complementary|pomocniczy|region|"
    r"\d+ (of|z) \d+.*|\d+/\d+.*|\d+ (items|element\w*))[,.]?$", re.I)
# a landmark entered ("główny | Zawodnicy | panel karty | …"): TalkBack runs on through what is in
# it for as long as the next swipe lets it, and its name is the tab just chosen; left out of the
# comparison
# a state TalkBack says before the name ("widok zwinięty, " … "Polski"): alone, it is the name come
# a swipe late, not a control without one
STATE_FIRST = re.compile(r"^((widok )?(zwinięty|rozwinięty)|wybran\w*|selected|collapsed|expanded)[,.]?$", re.I)
LANDMARK = re.compile(r"^(main|główny)$", re.I)

# where a table cell is ("Wiersz 2, Kolumna 1", "Kolumna 6"): said, or not, by timing
TABLE_PLACE = re.compile(r"(^|,\s*)(wiersz|kolumna|row|column) \d+(?!\d).*$", re.I)

# TalkBack at the last element of the page: the walk ends here (what follows is Chrome's own bar)
PAGE_END = re.compile(r"nie ma następnego elementu|no next item", re.I)

BANNER = "Analityka odwiedzin"  # the consent banner is the first thing on every page of the site
BASE = "http://localhost:8811"

SCREENS = {
    # name: (address, most steps, what TalkBack says on the first element of the page)
    "live": (f"{BASE}/?lang=pl", 80, BANNER),
    "live-bracket": (f"{BASE}/?lang=pl#live/bracket", 250, BANNER),
    "live-schedule": (f"{BASE}/?lang=pl#live/schedule", 250, BANNER),
    "live-results": (f"{BASE}/?lang=pl#live/history", 250, BANNER),
    "tournaments": (f"{BASE}/?lang=pl#tournaments", 120, BANNER),
    "tournament": (f"{BASE}/?lang=pl#tournaments/28", 250, BANNER),
    "tournament-schedule": (f"{BASE}/?lang=pl#tournaments/28/schedule", 250, BANNER),
    "tournament-results": (f"{BASE}/?lang=pl#tournaments/28/matches", 250, BANNER),
    "players": (f"{BASE}/?lang=pl#players", 300, BANNER),
    "profile": (f"{BASE}/?lang=pl#players/7", 200, BANNER),
    "panel": (f"{BASE}/panel?lang=pl", 40, "blindtennis.app"),
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

    # quiet: TalkBack may pause inside one element ("widok zwinięty," … its name) for over a second
    def collect(self, first_wait: float = 4.0, quiet: float = 2.0, poll: float = 0.3) -> list[str]:
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


def fresh_chrome() -> None:
    """Chrome as on a first visit: one tab, no remembered scroll or service worker, the consent
    banner showing. Its welcome screens stay away through the startup flags set once on the
    emulator (see the plan); the notification question is answered here, in Polish."""
    adb("shell", "pm", "clear", "com.android.chrome")
    adb("shell", "pm", "grant", "com.android.chrome", "android.permission.POST_NOTIFICATIONS")
    adb("shell", "cmd", "locale", "set-app-locales", "com.android.chrome", "--locales", "pl-PL")


def screen_xml() -> str:
    """The screen's elements. Careful: a uiautomator dump switches TalkBack off while it reads
    ("Usługa TalkBack jest wyłączona" … "TalkBack włączony"), so it is used only before a walk,
    followed by talkback_back()."""
    adb("shell", "uiautomator", "dump", "/sdcard/talkback-ui.xml")
    return adb("shell", "cat", "/sdcard/talkback-ui.xml")


def open_page(url: str) -> None:
    """The page in a Chrome that TalkBack can read.

    Chrome is cleared first (one tab, no remembered scroll or service worker, the consent banner
    showing), opened once, then closed and opened again with TalkBack already running: a cleared
    Chrome, and one that saw TalkBack paused by a screen dump, keeps the page's content away from
    TalkBack until it starts again. From here on nothing dumps the screen."""
    fresh_chrome()
    adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url, "com.android.chrome")
    time.sleep(15)  # a cleared Chrome starts slowly
    adb("shell", "am", "force-stop", "com.android.chrome")
    adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url, "com.android.chrome")
    time.sleep(12)


def walk(url: str, steps: int, first: str) -> list[str]:
    """From the first element of the page to its last, one swipe right at a time."""
    finger = Finger()
    speech = Speech()
    open_page(url)
    width, height = screen_size()
    left = lambda: finger.swipe(width * 5 // 6, height * 7 // 12, width // 5, height * 7 // 12)  # noqa: E731
    right = lambda: finger.swipe(width // 5, height * 7 // 12, width * 5 // 6, height * 7 // 12)  # noqa: E731
    # a finger in the middle of the page puts TalkBack on the page itself; a swipe right goes to
    # its first element (left, back to it, should TalkBack have landed further on)
    speech.drain()
    finger.tap(width // 2, height // 2)
    said = speech.collect()
    transcript: list[str] = []
    heard: list[str] = []
    for move in [right] * 3 + [left] * 40:
        if said and said[0].strip() == first:
            transcript.append(" | ".join(said))
            break
        heard.append(" | ".join(said) or "(cisza)")
        move()
        said = speech.collect()
    else:
        raise SystemExit(f"nie znalazłem pierwszego elementu strony ({first!r}); TalkBack mówił: {heard[:8]}")
    for _ in range(steps):
        right()
        said = speech.collect()
        if said and TEXT_FIELD.search(said[-1]):
            said += speech.collect(first_wait=8.0)
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
        elif fragments and not LANDMARK.match(fragments[0]) and not all(STATE_FIRST.match(part) for part in fragments) and all(ROLE_OR_STATE.match(part) for part in fragments):
            found.append(f"krok {step}: sama rola, bez nazwy: {line}")
    return found


def names(line: str) -> str:
    """What an element is called, without the role and state TalkBack adds (and says, or not, by timing)."""
    return " | ".join(part.strip() for part in line.split(" | ") if part.strip() and not ROLE_OR_STATE.match(part.strip()))


def spoken(lines: list[str]) -> list[str]:
    """The names in the order said, one per line. A fragment may come a swipe late (TalkBack still
    finishing the last element), so the comparison follows what is said, not which swipe said it."""
    said = []
    for line in lines:
        parts = names(line).split(" | ")
        if LANDMARK.match(line.split(" | ")[0].strip()):
            continue
        for part in parts:
            part = TABLE_PLACE.sub("", part).strip()
            # a table cell's content said again with its place ("Pokaż drogę: X, Kolumna 3") adds nothing
            if part and part != "(cisza)" and not HINTS.match(part) and part.casefold() not in (seen.casefold() for seen in said[-2:]):
                said.append(part)
    return said


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # the Windows console would mangle ą, ż, ł
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("screen", choices=sorted(SCREENS) + ["all"])
    parser.add_argument("--update", action="store_true", help="accept this run as the golden transcript")
    parser.add_argument("--steps", type=int, help="how many swipes (default: the screen's own)")
    args = parser.parse_args()

    if args.screen == "all":
        failed = [screen for screen in SCREENS if check(screen, args)]
        print("\nekrany z różnicami lub błędami:", ", ".join(failed) or "brak")
        return 1 if failed else 0
    return check(args.screen, args)


def check(name: str, args: argparse.Namespace) -> int:
    url, steps, first = SCREENS[name]
    print(f"\n=== {name}")
    # now and then Chrome's own bar takes the first touch and the page is never reached: once more
    for attempt in (1, 2):
        try:
            transcript = walk(url, args.steps or steps, first)
            break
        except SystemExit as stop:
            print(stop)
            if attempt == 2:
                return 1
    out = HERE / "runs" / f"{name}-{time.strftime('%Y%m%d-%H%M%S')}.txt"
    out.parent.mkdir(exist_ok=True)
    numbered = [f"{i:03d}  {line}" for i, line in enumerate(transcript)]
    out.write_text("\n".join(numbered) + "\n", encoding="utf-8")
    print("\n".join(numbered))
    print(f"\nzapis: {out}")

    issues = problems(transcript)
    for issue in issues:
        print("BŁĄD:", issue)

    golden = HERE / "golden" / f"{name}.txt"
    if args.update:
        golden.parent.mkdir(exist_ok=True)
        golden.write_text("\n".join(numbered) + "\n", encoding="utf-8")
        print(f"wzorzec zapisany: {golden}")
        return 1 if issues else 0
    if not golden.exists():
        print("brak wzorca: przejrzyj zapis i uruchom z --update")
        return 1
    # compared by names and order; the full lines (roles included) stay in both files to read
    expected = spoken([line.split("  ", 1)[1] for line in golden.read_text(encoding="utf-8").splitlines()])
    diff = list(difflib.unified_diff(expected, spoken(transcript),
                                     "wzorzec", "ten przebieg", lineterm="", n=1))
    for line in diff:
        print(line)
    return 1 if (diff or issues) else 0


if __name__ == "__main__":
    sys.exit(main())
