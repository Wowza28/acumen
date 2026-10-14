"use client";

export function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export function kindOf(mime: string, name: string): string {
  const ext = extOf(name);
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (mime.includes("pdf") || ext === "pdf") return "pdf";
  if (mime.includes("word") || ["doc", "docx"].includes(ext)) return "doc";
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv" || ["xlsx", "xls", "csv"].includes(ext)) return "sheet";
  if (mime.startsWith("text/") || ["txt", "md", "json"].includes(ext)) return "text";
  if (mime.startsWith("audio/") || ["mp3", "wav", "webm", "ogg"].includes(ext)) return "audio";
  if (mime.startsWith("video/") || ["mp4", "mov"].includes(ext)) return "video";
  return "file";
}

export function fmtSize(b?: number | null): string {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
