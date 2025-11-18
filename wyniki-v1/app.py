"""Application entrypoint for running the wyniki service."""
from __future__ import annotations

from wyniki.config import log, settings
from wyniki.web import app as application

app = application


if __name__ == "__main__":
    log.info("Starting wyniki server on port %s", settings.port)
    app.run(host="0.0.0.0", port=settings.port, debug=False)
