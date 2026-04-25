#!/usr/bin/env python3
"""Create a production backup archive of the live Docker data volume over SSH."""
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
    parser.add_argument("--backup-root", default="/mnt/dysk12tb/wyniki-backups")
    parser.add_argument("--name", default="wyniki")
    args = parser.parse_args()

    remote_script = f"""
set -euo pipefail
backup_root={shlex.quote(args.backup_root)}
project_path={shlex.quote(args.project_path)}
volume_name={shlex.quote(args.volume)}
backup_name={shlex.quote(args.name)}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
if mkdir -p "$backup_root" 2>/dev/null; then
    resolved_root="$backup_root"
else
    resolved_root="$HOME/wyniki-backups"
    mkdir -p "$resolved_root"
fi
target_dir="$resolved_root/$backup_name"
archive="$target_dir/wyniki-data-$timestamp.tar.gz"
checksum="$archive.sha256"
metadata="$archive.json"
mkdir -p "$target_dir"
docker run --rm \
    -v "$volume_name:/source:ro" \
    -v "$target_dir:/backup" \
    count-wyniki-v2:latest \
    sh -lc "tar -C /source -czf /backup/$(basename \"$archive\") ."
sha256sum "$archive" > "$checksum"
git_revision=$(git -C "$project_path" rev-parse HEAD)
cat > "$metadata" <<EOF
{{
  "created_at": "$timestamp",
  "host": {shlex.quote(args.host)},
  "project_path": "$project_path",
  "volume": "$volume_name",
  "git_revision": "$git_revision",
  "archive": "$archive"
}}
EOF
printf '%s\n%s\n%s\n' "$archive" "$checksum" "$metadata"
"""

    result = run_ssh(args.host, f"bash -lc {shlex.quote(remote_script)}")
    if result.returncode != 0:
        sys.stderr.write(result.stderr)
        return result.returncode

    sys.stdout.write(result.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())