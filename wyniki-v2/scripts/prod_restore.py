#!/usr/bin/env python3
"""Restore the live Docker data volume and code revision over SSH."""
from __future__ import annotations

import argparse
import shlex
import subprocess
import sys


def run_ssh(host: str, command: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["ssh", host, command], text=True, capture_output=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="minipc")
    parser.add_argument("--project-path", default="/home/suchokrates1/count/wyniki-v2")
    parser.add_argument("--volume", default="count_wyniki_data")
    parser.add_argument("--backup-file", required=True)
    parser.add_argument("--git-revision", required=True)
    parser.add_argument("--safety-backup-root", default="/mnt/dysk12tb/wyniki-backups/pre-restore")
    parser.add_argument("--yes", action="store_true")
    args = parser.parse_args()

    if not args.yes:
        sys.stderr.write("Refusing to restore without --yes\n")
        return 2

    remote_script = f"""
set -euo pipefail
project_path={shlex.quote(args.project_path)}
volume_name={shlex.quote(args.volume)}
backup_file={shlex.quote(args.backup_file)}
git_revision={shlex.quote(args.git_revision)}
safety_root={shlex.quote(args.safety_backup_root)}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
test -f "$backup_file"
if mkdir -p "$safety_root" 2>/dev/null; then
    resolved_safety_root="$safety_root"
else
    resolved_safety_root="$HOME/wyniki-backups/pre-restore"
    mkdir -p "$resolved_safety_root"
fi
pre_restore="$resolved_safety_root/wyniki-pre-restore-$timestamp.tar.gz"
backup_dir=$(dirname "$backup_file")
backup_name=$(basename "$backup_file")
docker run --rm \
    -v "$volume_name:/source:ro" \
    -v "$resolved_safety_root:/backup" \
    count-wyniki-v2:latest \
    sh -lc "tar -C /source -czf /backup/$(basename \"$pre_restore\") ."
cd "$project_path"
git fetch --all
git checkout "$git_revision"
docker compose down
docker run --rm \
    -v "$volume_name:/target" \
    -v "$backup_dir:/restore:ro" \
    count-wyniki-v2:latest \
    sh -lc "find /target -mindepth 1 -maxdepth 1 -exec rm -rf {{}} + && tar -C /target -xzf /restore/$backup_name"
docker compose up -d --build
curl -fsS http://localhost:8087/api/snapshot > /dev/null
printf 'PRE_RESTORE=%s\nRESTORED=%s\nREVISION=%s\n' "$pre_restore" "$backup_file" "$git_revision"
"""

    result = run_ssh(args.host, f"bash -lc {shlex.quote(remote_script)}")
    if result.returncode != 0:
        sys.stderr.write(result.stderr)
        return result.returncode

    sys.stdout.write(result.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())