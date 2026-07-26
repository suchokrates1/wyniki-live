#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://score.vestmedia.pl}"
BACKUP_CONF="${BACKUP_CONF:-$HOME/backup.conf}"
MAX_BACKUP_AGE_DAYS="${MAX_BACKUP_AGE_DAYS:-1}"
MIN_FREE_GIB="${MIN_FREE_GIB:-2}"
CONTAINER_NAME="${CONTAINER_NAME:-wyniki-tenis-v2}"

on_exit() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    logger -t wyniki-ops-check "FAILED status=$status base_url=$BASE_URL"
  fi
}
trap on_exit EXIT

if [ ! -f "$BACKUP_CONF" ]; then
  echo "Missing backup config: $BACKUP_CONF" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$BACKUP_CONF"

# --- Health ---
health_json="$(curl -fsSL "$BASE_URL/health")"
echo "$health_json" | python3 -c 'import json,sys; data=json.load(sys.stdin); assert data.get("status")=="healthy", data'

curl -fsSL "$BASE_URL/" -o /tmp/wyniki-public-home.html
curl -fsSL "$BASE_URL/api/snapshot" \
  | python3 -c 'import json,sys; data=json.load(sys.stdin); courts=data.get("courts"); assert isinstance(courts, (dict, list)), "snapshot.courts must be object or list"'

# --- Disk free space (Docker data root + backup fallback home) ---
check_free() {
  local path="$1"
  if [ ! -d "$path" ]; then
    return 0
  fi
  local avail_kb
  avail_kb="$(df -Pk "$path" | awk 'NR==2 {print $4}')"
  local avail_gib
  avail_gib="$(python3 -c "print(int($avail_kb)/1024/1024)")"
  python3 -c "import sys; sys.exit(0 if float('$avail_gib') >= float('$MIN_FREE_GIB') else 1)" \
    || { echo "Low free space on $path: ${avail_gib} GiB (< ${MIN_FREE_GIB} GiB)" >&2; exit 1; }
  echo "disk_ok path=$path free_gib=$avail_gib"
}

check_free /var/lib/docker
check_free "${HOME}/wyniki-backups"
check_free /mnt/dysk12tb

# --- Container log scan (umpire sync / auth failures) ---
if command -v docker >/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    recent_logs="$(docker logs --since 25h "$CONTAINER_NAME" 2>&1 | tail -n 400 || true)"
    if echo "$recent_logs" | grep -Eiq 'umpire.*(error|fail)|sync.*(error|fail)|legacy_unauthed_umpire_request'; then
      # Count only dense bursts; a few warnings during grace are OK.
      hits="$(echo "$recent_logs" | grep -Eic 'umpire.*(error|fail)|Failed to .*match|sync.*fail' || true)"
      if [ "${hits:-0}" -gt 25 ]; then
        echo "Elevated umpire/sync errors in $CONTAINER_NAME logs (hits=$hits)" >&2
        exit 1
      fi
      echo "log_warn umpire/sync hits=$hits (below threshold)"
    fi
  fi
fi

latest_backup="$(
  ssh -i "$NAS_SSH_KEY" -o BatchMode=yes "$NAS_HOST" \
    "ls -1 '$NAS_BACKUP_DIR' 2>/dev/null | grep -E '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' | sort | tail -n 1"
)"

if [ -z "$latest_backup" ]; then
  echo "No dated NAS backup directories found in $NAS_BACKUP_DIR" >&2
  exit 1
fi

latest_epoch="$(date -d "$latest_backup" +%s)"
today_epoch="$(date -d "$(date +%F)" +%s)"
age_days="$(( (today_epoch - latest_epoch) / 86400 ))"

if [ "$age_days" -lt 0 ] || [ "$age_days" -gt "$MAX_BACKUP_AGE_DAYS" ]; then
  echo "Latest NAS backup is too old: $latest_backup (${age_days} days)" >&2
  exit 1
fi

echo "$(date -Is) OK base_url=$BASE_URL latest_backup=$latest_backup age_days=$age_days"
