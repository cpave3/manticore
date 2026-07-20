#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${1:-$REPO_ROOT/manticore.db}"
BACKUP_PATH="${2:-/tmp/manticore-unraid.db}"
SERVICE="${MANTICORE_SERVICE:-manticore.service}"
SERVICE_WAS_ACTIVE=false

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' was not found." >&2
    exit 1
  fi
}

check_integrity() {
  local path="$1"
  local result

  result="$(sqlite3 "$path" 'PRAGMA integrity_check;')"
  if [[ "$result" != "ok" ]]; then
    echo "Error: SQLite integrity check failed for $path:" >&2
    echo "$result" >&2
    return 1
  fi

  echo "Integrity check passed: $path"
}

restart_service() {
  local status=$?
  trap - EXIT

  if [[ "$SERVICE_WAS_ACTIVE" == true ]]; then
    echo "Restarting $SERVICE..."
    if ! systemctl --user start "$SERVICE"; then
      echo "Error: failed to restart $SERVICE. Start it manually with:" >&2
      echo "  systemctl --user start $SERVICE" >&2
      exit 1
    fi
  fi

  exit "$status"
}

require_command sqlite3
require_command systemctl

if [[ ! -f "$DB_PATH" ]]; then
  echo "Error: database not found: $DB_PATH" >&2
  exit 1
fi

if [[ "$DB_PATH" == "$BACKUP_PATH" ]]; then
  echo "Error: source and backup paths must be different." >&2
  exit 1
fi

if systemctl --user is-active --quiet "$SERVICE"; then
  SERVICE_WAS_ACTIVE=true
fi

trap restart_service EXIT

if [[ "$SERVICE_WAS_ACTIVE" == true ]]; then
  echo "Stopping $SERVICE..."
  systemctl --user stop "$SERVICE"
else
  echo "$SERVICE is already stopped; it will remain stopped."
fi

echo "Checkpointing SQLite WAL..."
sqlite3 "$DB_PATH" 'PRAGMA wal_checkpoint(TRUNCATE);' >/dev/null
check_integrity "$DB_PATH"

echo "Creating backup: $BACKUP_PATH"
rm -f "$BACKUP_PATH"
sqlite3 "$DB_PATH" ".backup '$BACKUP_PATH'"
check_integrity "$BACKUP_PATH"
chmod 600 "$BACKUP_PATH"
ls -lh "$BACKUP_PATH"

echo "Backup ready: $BACKUP_PATH"
