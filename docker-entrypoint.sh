#!/bin/sh
set -e

PORT="${PORT:-8000}"

# Ensure data directories exist
mkdir -p /app/prisma
mkdir -p "${UPLOAD_DIR:-/app/uploads}"

echo "==> Initializing database schema..."
npx prisma db push --skip-generate

echo "==> Starting ACUMEN on port ${PORT}..."
exec npx next start -p "${PORT}" -H "0.0.0.0"

