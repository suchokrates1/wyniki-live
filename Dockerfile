FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    DB_PATH=/app/wyniki_archive.sqlite3

WORKDIR /app

# Zależności
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Aplikacja + statyki
COPY app.py index.html ./
COPY static ./static

EXPOSE 8080

# Produkcyjny serwer (1 worker, żeby nie dublować pollera)
CMD ["gunicorn", "--workers", "1", "--threads", "4", "--bind", "0.0.0.0:8080", "app:app"]
