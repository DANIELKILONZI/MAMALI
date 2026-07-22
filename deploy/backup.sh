#!/usr/bin/env bash
# =============================================================================
# MAMALI Database Backup
#
# Backs up the database referenced by backend/.env (DATABASE_URL).
# Supports SQLite (file:...) and PostgreSQL (postgres://...).
#
# Usage:
#   ./deploy/backup.sh [backup-dir]     # default: ./backups
#
# Suggested cron (daily at 03:00, keep 14 days):
#   0 3 * * * /path/to/MAMALI/deploy/backup.sh /var/backups/mamali
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${1:-$PROJECT_ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

DATABASE_URL="$(grep '^DATABASE_URL=' "$PROJECT_ROOT/backend/.env" | cut -d= -f2- | tr -d '"')"
[[ -n "$DATABASE_URL" ]] || DATABASE_URL="file:./dev.db"

if [[ "$DATABASE_URL" == file:* ]]; then
  # SQLite — resolve path relative to backend/prisma (Prisma convention)
  DB_PATH="${DATABASE_URL#file:}"
  [[ "$DB_PATH" = /* ]] || DB_PATH="$PROJECT_ROOT/backend/prisma/$DB_PATH"

  [[ -f "$DB_PATH" ]] || { echo "ERROR: SQLite database not found at $DB_PATH" >&2; exit 1; }

  OUT="$BACKUP_DIR/mamali-$TIMESTAMP.db"
  if command -v sqlite3 >/dev/null 2>&1; then
    # .backup is safe against concurrent writers (unlike plain cp)
    sqlite3 "$DB_PATH" ".backup '$OUT'"
  else
    echo "WARN: sqlite3 CLI not found; falling back to cp (stop the app first for consistency)" >&2
    cp "$DB_PATH" "$OUT"
  fi
  gzip -f "$OUT"
  echo "OK: $OUT.gz"

elif [[ "$DATABASE_URL" == postgres* ]]; then
  command -v pg_dump >/dev/null 2>&1 || { echo "ERROR: pg_dump not found" >&2; exit 1; }
  OUT="$BACKUP_DIR/mamali-$TIMESTAMP.sql.gz"
  pg_dump "$DATABASE_URL" | gzip > "$OUT"
  echo "OK: $OUT"

else
  echo "ERROR: Unrecognized DATABASE_URL scheme: ${DATABASE_URL%%:*}" >&2
  exit 1
fi

# Retention
find "$BACKUP_DIR" -name 'mamali-*' -mtime "+$RETENTION_DAYS" -delete
echo "Retention: backups older than $RETENTION_DAYS days removed."
