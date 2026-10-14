#!/bin/sh
set -e

PORT="${PORT:-8000}"
DATA_DIR="${DATA_DIR:-/data}"
DB_FILE="${DB_FILE:-${DATA_DIR}/acumen.db}"
UPLOAD_DIR="${UPLOAD_DIR:-${DATA_DIR}/uploads}"

# Ensure data directories exist
mkdir -p "$DATA_DIR" "$UPLOAD_DIR"

# --- one-time migration from the pre-1.1 layout (volumes mounted at
# /app/prisma + /app/uploads, database file dev.db). Only copies when the
# new location is empty, so it never overwrites existing data. ---
if [ ! -f "$DB_FILE" ]; then
  if [ -f "${DATA_DIR}/dev.db" ]; then
    echo "==> Migrating legacy database ${DATA_DIR}/dev.db -> ${DB_FILE}"
    cp "${DATA_DIR}/dev.db" "$DB_FILE"
  elif [ -f /app/prisma/dev.db ]; then
    echo "==> Migrating legacy database /app/prisma/dev.db -> ${DB_FILE}"
    cp /app/prisma/dev.db "$DB_FILE"
  fi
fi
if [ "/app/uploads" != "$UPLOAD_DIR" ] && [ -d /app/uploads ] && [ -n "$(ls -A /app/uploads 2>/dev/null)" ]; then
  echo "==> Migrating legacy uploads /app/uploads -> ${UPLOAD_DIR}"
  cp -rn /app/uploads/. "$UPLOAD_DIR"/ 2>/dev/null || true
fi
# A stale copy of schema.prisma from the old layout can end up inside the
# data volume — it is not the database, just remove it to avoid confusion.
rm -f "${DATA_DIR}/schema.prisma"

export DATABASE_URL="file:${DB_FILE}"
export UPLOAD_DIR

echo "==> Initializing database schema..."
npx prisma db push --skip-generate

echo "==> Starting ACUMEN on port ${PORT}..."
exec npx next start -p "${PORT}" -H "0.0.0.0"

