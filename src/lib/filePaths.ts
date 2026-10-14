// Resolve a stored file path against the current upload dir. Older rows
// store absolute paths from a previous UPLOAD_DIR layout (e.g. /app/uploads);
// remap those onto the active dir so downloads/previews survive moves.
import path from "path";
export function resolveStoredPath(stored: string): string {
  const dir = process.env.UPLOAD_DIR || "./uploads";
  if (!stored) return stored;
  if (stored.startsWith(dir)) return stored;
  const base = path.basename(stored);
  return base ? path.join(dir, base) : stored;
}
