#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://score.vestmedia.pl}"
BACKUP_CONF="${BACKUP_CONF:-$HOME/backup.conf}"
MAX_BACKUP_AGE_DAYS="${MAX_BACKUP_AGE_DAYS:-1}"

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

curl -fsSL "$BASE_URL/" -o /tmp/wyniki-public-home.html
curl -fsSL "$BASE_URL/api/snapshot" \
  | python3 -c 'import json,sys; data=json.load(sys.stdin); courts=data.get("courts"); assert isinstance(courts, (dict, list)), "snapshot.courts must be object or list"'

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