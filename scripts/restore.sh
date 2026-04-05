#!/usr/bin/env bash
# =============================================================================
# MAMALI Database Restore Script
# Usage:
#   ./scripts/restore.sh <backup_file>
#   ./scripts/restore.sh backups/mamali_sqlite_20240101_120000.db.gz
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

BACKUP_FILE="${1:-}"
if [[ -z "$BACKUP_FILE" ]]; then
  echo "Usage: $0 <backup_file>" >&2
  echo ""
  echo "Available backups:"
  ls -lh "$ROOT_DIR/backups/" 2>/dev/null || echo "  (no backups directory found)"
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  # Try relative to backups dir
  if [[ -f "$ROOT_DIR/backups/$BACKUP_FILE" ]]; then
    BACKUP_FILE="$ROOT_DIR/backups/$BACKUP_FILE"
  else
    echo "ERROR: Backup file not found: $BACKUP_FILE" >&2
    exit 1
  fi
fi

# Load env if available
if [[ -f "$ROOT_DIR/backend/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$ROOT_DIR/backend/.env"; set +a
fi

DATABASE_URL="${DATABASE_URL:-file:$ROOT_DIR/backend/prisma/dev.db}"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting MAMALI restore from: $BACKUP_FILE"
echo ""
echo "WARNING: This will OVERWRITE your current database!"
read -r -p "Are you sure? (yes/no): " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "Restore cancelled."
  exit 0
fi

# ─── SQLite restore ──────────────────────────────────────────────────────────
if [[ "$DATABASE_URL" == file:* ]]; then
  DB_PATH="${DATABASE_URL#file:}"
  if [[ ! "$DB_PATH" = /* ]]; then
    DB_PATH="$ROOT_DIR/backend/$DB_PATH"
  fi

  # Create pre-restore backup of current DB
  if [[ -f "$DB_PATH" ]]; then
    PRERESTORE_BACKUP="${DB_PATH}.prerestore.$(date +%Y%m%d_%H%M%S)"
    echo "Creating pre-restore backup of current database: $PRERESTORE_BACKUP"
    cp "$DB_PATH" "$PRERESTORE_BACKUP"
  fi

  # Decompress if needed
  if [[ "$BACKUP_FILE" == *.gz ]]; then
    TEMP_FILE=$(mktemp /tmp/mamali_restore_XXXXXX.db)
    gunzip -c "$BACKUP_FILE" > "$TEMP_FILE"
    cp "$TEMP_FILE" "$DB_PATH"
    rm -f "$TEMP_FILE"
  else
    cp "$BACKUP_FILE" "$DB_PATH"
  fi

  echo "SQLite database restored to: $DB_PATH"

# ─── PostgreSQL restore ──────────────────────────────────────────────────────
elif [[ "$DATABASE_URL" == postgres* ]]; then
  if ! command -v pg_restore &>/dev/null; then
    echo "ERROR: pg_restore not found. Install postgresql-client." >&2
    exit 1
  fi

  echo "Restoring PostgreSQL database..."
  pg_restore \
    --no-password \
    --clean \
    --if-exists \
    --dbname="$DATABASE_URL" \
    "$BACKUP_FILE"

  echo "PostgreSQL database restored."

else
  echo "ERROR: Unsupported DATABASE_URL format: $DATABASE_URL" >&2
  exit 1
fi

echo ""
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Restore complete."
echo "Restart the application to verify: cd backend && npm start"
