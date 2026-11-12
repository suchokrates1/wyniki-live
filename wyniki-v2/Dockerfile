## Stage 1: Build frontend with Vite
FROM node:22-alpine AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

## Stage 2: Python app
FROM python:3.13-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ffmpeg tzdata && \
    rm -rf /var/lib/apt/lists/*

# "Today" is read in three ways in the code: date.today(), SQLite's date('now','localtime')
# and an explicit Europe/Warsaw clock. In UTC the first two ran one to two hours behind the
# third, so around midnight they disagreed about which tournament day it is. Timestamps
# that are stored stay UTC; they are written with an explicit zone.
ENV TZ=Europe/Warsaw

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY wyniki ./wyniki
COPY app.py .

# Overlay page (standalone) + Vest Media TV watermark asset
COPY vest-media-logo.png .

# Copy Vite-built frontend (overwrites any stale static/ files)
COPY --from=frontend-build /wyniki/static ./wyniki/static

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run gunicorn with gevent worker class for async SSE support
# gevent allows thousands of concurrent SSE connections without blocking
CMD ["gunicorn", "--worker-class", "gevent", "--workers", "1", "--bind", "0.0.0.0:8080", \
     "--access-logfile", "-", "--error-logfile", "-", \
     "--log-level", "info", "app:app"]
