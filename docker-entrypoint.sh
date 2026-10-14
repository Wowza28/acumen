#!/bin/sh
set -e

PORT="${PORT:-8000}"

# Data paths: honor the environment (compose.yaml / Dockge stack set these)
# and fall back to the canonical paths. NEVER change the defaults without
# also updating every deployed stack file — mismatched paths orphan the DB.
# NOTE: prisma reads DATABASE_URL from the environment at runtime (schema
# uses env("DATABASE_URL")), so exporting it here controls both `db push`
# and the Next.js server.
UPLOAD_DIR="${UPLOAD_DIR:-/app/uploads}"
export UPLOAD_DIR
mkdir -p "$(dirname "${DATABASE_URL:-file:/app/prisma/dev.db}" | sed 's|^file:||')" "$UPLOAD_DIR" 2>/dev/null || true
mkdir -p /app/prisma "$UPLOAD_DIR"

# Legacy layouts (named volumes / /data paths briefly shipped): if the active
# DB file is missing but a database exists in a legacy location, adopt it so
# no data is orphaned. Only runs when the bind-mounted DB is absent, so it
# never overwrites live data.
case "${DATABASE_URL:-}" in
  file:*)
    ACTIVE_DB="$(printf '%s' "$DATABASE_URL" | sed 's|^file:||')"
    ;;
  *)
    ACTIVE_DB="/app/prisma/dev.db"
    export DATABASE_URL="file:${ACTIVE_DB}"
    ;;
esac
if [ ! -f "$ACTIVE_DB" ]; then
  if [ -f /data/acumen.db ]; then
    echo "==> Adopting legacy database /data/acumen.db -> ${ACTIVE_DB}"
    cp /data/acumen.db "$ACTIVE_DB"
  elif [ -f /data/dev.db ]; then
    echo "==> Adopting legacy database /data/dev.db -> ${ACTIVE_DB}"
    cp /data/dev.db "$ACTIVE_DB"
  fi
fi
if [ "/data/uploads" != "$UPLOAD_DIR" ] && [ -d /data/uploads ] && [ -n "$(ls -A /data/uploads 2>/dev/null)" ]; then
  echo "==> Migrating legacy uploads /data/uploads -> ${UPLOAD_DIR}"
  cp -rn /data/uploads/. "${UPLOAD_DIR}"/ 2>/dev/null || true
fi

# A stale copy of schema.prisma from the old layout can end up inside the
# data volume — it is not the database, just remove it to avoid confusion.
# (Best-effort: the volume files may be root-owned from an older setup.)
rm -f /app/prisma/schema.prisma 2>/dev/null || true

echo "==> Initializing database schema..."
# --schema points at the copy baked into the image OUTSIDE the /app/prisma
# volume mount. Without this, the volume's stale schema.prisma would shadow
# the new one and `db push` would silently skip new columns (e.g. tag).
#
# Backfill first: very old databases have NULL updatedAt rows, which makes
# `db push` refuse to enforce the now-required column. Filling them is safe
# (updatedAt just becomes "now") and avoids a forced database reset.
# Runs for every table that has an updatedAt column (schema uses @updatedAt
# widely: contacts, projects, notes, tasks, documents, ...). Best-effort:
# unknown tables are skipped silently so this never blocks startup.
if command -v sqlite3 >/dev/null 2>&1 && [ -f "$ACTIVE_DB" ]; then
  for TBL in Contact ContactEmail ContactPhone Project Note Document Task Chat ChatMessage AppSetting Transaction VatExclusion TransactionLink SyncedEmail TitanAccount EventLink DocChunk ProjectContact; do
    sqlite3 "$ACTIVE_DB" "UPDATE \"$TBL\" SET \"updatedAt\" = CURRENT_TIMESTAMP WHERE \"updatedAt\" IS NULL;" 2>/dev/null || true
  done
fi
npx prisma db push --schema /app/schema.prisma --skip-generate

echo "==> Starting ACUMEN on port ${PORT}..."
exec npx next start -p "${PORT}" -H "0.0.0.0"

