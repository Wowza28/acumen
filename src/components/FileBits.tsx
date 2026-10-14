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

export const FILE_TAGS = ["Invoice", "Agreement", "KYC"] as const;
export type FileTag = (typeof FILE_TAGS)[number];

export function tagClasses(tag?: string | null): string {
  switch (tag) {
    case "Invoice":
      return "bg-green-100 text-green-700 border-green-300 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30";
    case "Agreement":
      return "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30";
    case "KYC":
      return "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-500/30";
    default:
      return "";
  }
}
