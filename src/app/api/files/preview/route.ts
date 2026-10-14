import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveStoredPath } from "@/lib/filePaths";
import fs from "fs/promises";

// GET /api/files/preview?id= — preview metadata for the slide-over viewer.
// PDFs and Word docs are rendered client-side (pdf.js / docx-preview, both npm
// in-project — no system binaries). This route only serves metadata plus
// parsed sheet data for Excel/CSV (xlsx npm package).
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const d = await prisma.document.findUnique({ where: { id }, include: { contact: true, project: true } });
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });

  const name = d.filename.toLowerCase();
  const mime = d.mime || "";
  const kind =
    mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/.test(name) ? "image" :
    mime.includes("pdf") || name.endsWith(".pdf") ? "pdf" :
    name.endsWith(".docx") || name.endsWith(".doc") || mime.includes("word") ? "docx" :
    /\.(xlsx|xls|csv)$/.test(name) ? "sheet" :
    mime.startsWith("audio/") ? "audio" :
    mime.startsWith("video/") ? "video" :
    mime.startsWith("text/") || /\.(txt|md|markdown|log|json|xml|yml|yaml)$/.test(name) ? "text" : "other";

  const meta = {
    id: d.id, filename: d.filename, mime: d.mime, size: d.size, kind,
    summary: d.summary, tag: (d as any).tag || null,
    contact: d.contact ? { id: d.contact.id, name: d.contact.name } : null,
    project: d.project ? { id: d.project.id, title: d.project.title } : null,
    createdAt: d.createdAt, updatedAt: d.updatedAt
  };

  try {
    const p = resolveStoredPath(d.path);
    if (kind === "sheet") {
      if (name.endsWith(".csv")) {
        const text = await fs.readFile(p, "utf8");
        const rows = text.split(/\r?\n/).slice(0, 200).map((l) => l.split(","));
        return NextResponse.json({ ...meta, sheets: [{ name: d.filename, rows }] });
      }
      const XLSX = await import("xlsx");
      const buf = await fs.readFile(p);
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheets = wb.SheetNames.slice(0, 10).map((s) => ({
        name: s,
        rows: XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, defval: "" }).slice(0, 200) as any[][]
      }));
      return NextResponse.json({ ...meta, sheets });
    }
    if (kind === "text") {
      // Read plain text (up to 1 MB) for inline preview in the viewer.
      const MAX = 1024 * 1024;
      const buf = await fs.readFile(p);
      const text = buf.subarray(0, MAX).toString("utf8");
      return NextResponse.json({ ...meta, text, textTruncated: buf.length > MAX });
    }
    return NextResponse.json(meta);
  } catch (e: any) {
    return NextResponse.json({ ...meta, previewError: e.message?.slice(0, 200) });
  }
}
