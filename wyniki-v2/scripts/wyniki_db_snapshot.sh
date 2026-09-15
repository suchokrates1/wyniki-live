#!/usr/bin/env bash
# Consistent copy of the live wyniki SQLite database for the nightly backup.
#
# The database lives in the Docker volume count_wyniki_data, which the backup user cannot
# read. The copy is made inside the running container with Python's sqlite3 backup API
# (safe while the app writes), checked with PRAGMA integrity_check and left where
# backup.sh picks it up (BACKUP_SQLITE in ~/backup/backup.conf). Runs from cron at 02:55.
set -euo pipefail

CONTAINER="${CONTAINER:-wyniki-tenis-v2}"
OUT_DIR="${OUT_DIR:-/home/suchokrates1/backup/snapshots}"
OUT="$OUT_DIR/wyniki.sqlite3"
IN_CONTAINER="/tmp/wyniki-snapshot.sqlite3"

mkdir -p "$OUT_DIR"
docker exec "$CONTAINER" python -c "
import sqlite3
source = sqlite3.connect('/data/wyniki.sqlite3')
target = sqlite3.connect('$IN_CONTAINER')
source.backup(target)
target.close()
source.close()
"
docker cp "$CONTAINER:$IN_CONTAINER" "$OUT.tmp"
docker exec "$CONTAINER" rm -f "$IN_CONTAINER"
if [ "$(sqlite3 "$OUT.tmp" 'PRAGMA integrity_check;')" != "ok" ]; then
  echo "$(date -Is) FAILED integrity_check" >&2
  rm -f "$OUT.tmp"
  exit 1
fi
mv "$OUT.tmp" "$OUT"
echo "$(date -Is) ok $(du -h "$OUT" | cut -f1) tournaments=$(sqlite3 "$OUT" 'SELECT COUNT(*) FROM tournaments;')"
