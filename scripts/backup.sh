#!/usr/bin/env bash
# =============================================================================
# MAMALI Database Backup Script
# Usage:
#   ./scripts/backup.sh              # creates a timestamped backup
#   ./scripts/backup.sh --rotate 7   # keep last 7 backups (default: 14)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
KEEP_LAST="${1:-}"
ROTATE_COUNT=14

# Parse --rotate flag
while [[ $# -gt 0 ]]; do
  case "$1" in
    --rotate)
      ROTATE_COUNT="${2:-14}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

mkdir -p "$BACKUP_DIR"

# Load env if available
if [[ -f "$ROOT_DIR/backend/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$ROOT_DIR/backend/.env"; set +a
fi

DATABASE_URL="${DATABASE_URL:-file:$ROOT_DIR/backend/prisma/dev.db}"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting MAMALI backup..."

# ─── SQLite backup ──────────────────────────────────────────────────────────
if [[ "$DATABASE_URL" == file:* ]]; then
  DB_PATH="${DATABASE_URL#file:}"
  # Make absolute path relative to backend directory if not absolute
  if [[ ! "$DB_PATH" = /* ]]; then
    DB_PATH="$ROOT_DIR/backend/$DB_PATH"
  fi

  BACKUP_FILE="$BACKUP_DIR/mamali_sqlite_$TIMESTAMP.db"

  if [[ ! -f "$DB_PATH" ]]; then
    echo "ERROR: SQLite database not found at $DB_PATH" >&2
    exit 1
  fi

  # Use SQLite's .backup command for a consistent hot copy
  if command -v sqlite3 &>/dev/null; then
    sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
  else
    cp "$DB_PATH" "$BACKUP_FILE"
  fi

  # Compress
  gzip -f "$BACKUP_FILE"
  BACKUP_FILE="$BACKUP_FILE.gz"

  echo "SQLite backup created: $BACKUP_FILE"

# ─── PostgreSQL backup ──────────────────────────────────────────────────────
elif [[ "$DATABASE_URL" == postgres* ]]; then
  if ! command -v pg_dump &>/dev/null; then
    echo "ERROR: pg_dump not found. Install postgresql-client." >&2
    exit 1
  fi

  BACKUP_FILE="$BACKUP_DIR/mamali_postgres_$TIMESTAMP.sql.gz"

  pg_dump "$DATABASE_URL" \
    --no-password \
    --format=custom \
    --compress=9 \
    --file="$BACKUP_FILE"

  echo "PostgreSQL backup created: $BACKUP_FILE"

else
  echo "ERROR: Unsupported DATABASE_URL format: $DATABASE_URL" >&2
  exit 1
fi

# ─── Backup rotation ────────────────────────────────────────────────────────
echo "Rotating backups, keeping last $ROTATE_COUNT..."
# List backup files sorted by name (timestamp-based), delete oldest
BACKUP_FILES=()
while IFS= read -r -d $'\0' f; do
  BACKUP_FILES+=("$f")
done < <(find "$BACKUP_DIR" -maxdepth 1 -name "mamali_*" -type f -print0 | sort -z)

TOTAL=${#BACKUP_FILES[@]}
if (( TOTAL > ROTATE_COUNT )); then
  DELETE_COUNT=$(( TOTAL - ROTATE_COUNT ))
  echo "Deleting $DELETE_COUNT old backup(s)..."
  for (( i=0; i<DELETE_COUNT; i++ )); do
    rm -f "${BACKUP_FILES[$i]}"
    echo "  Deleted: ${BACKUP_FILES[$i]}"
  done
fi

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup complete: $BACKUP_FILE"
echo "Total backups retained: $(find "$BACKUP_DIR" -maxdepth 1 -name "mamali_*" | wc -l)"
