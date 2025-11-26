FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY wyniki ./wyniki
COPY app.py .

# Copy HTML files
COPY overlay.html .
COPY overlay_all.html .
COPY frontend/index.html .
COPY frontend/admin.html .
COPY frontend/embed.html .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run gunicorn with gevent worker class for async SSE support
# gevent allows thousands of concurrent SSE connections without blocking
CMD ["gunicorn", "--worker-class", "gevent", "--workers", "4", "--bind", "0.0.0.0:8080", \
     "--access-logfile", "-", "--error-logfile", "-", \
     "--log-level", "info", "app:app"]
