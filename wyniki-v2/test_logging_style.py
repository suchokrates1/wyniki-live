"""Logs are events with fields, so they can be searched and counted.

structlog writes JSON in production: `logger.info("match_finished", kort=kort_id)` lands
as a field anyone can filter on, while an f-string buries the court inside a sentence.
ruff cannot tell a structlog logger from any other object, so this test looks instead.
"""
import pathlib
import re

F_STRING_LOG = re.compile(r"\b(?:logger|log)\.(?:debug|info|warning|error|exception|critical)\(\s*f['\"]")


def test_no_log_message_is_an_f_string():
    root = pathlib.Path(__file__).parent
    offenders = [
        f"{path.relative_to(root).as_posix()}:{number}"
        for path in [root / "app.py", *(root / "wyniki").rglob("*.py")]
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
        if F_STRING_LOG.search(line)
    ]
    assert offenders == [], "Log an event name with fields instead: " + ", ".join(offenders)
