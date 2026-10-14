import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import fs from "fs/promises";
import path from "path";

// GET /api/projects/logo?id= — serves the uploaded project logo.
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const p = await prisma.project.findUnique({ where: { id } });
  if (!p?.logo) return NextResponse.json({ error: "no logo" }, { status: 404 });
  try {
    const buf = await fs.readFile(p.logo);
    const ext = path.extname(p.logo).toLowerCase();
    const mime = ext === ".svg" ? "image/svg+xml" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600" }
    });
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }
}

// POST /api/projects/logo — multipart form: id + file. Stores logo, replaces old.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const id = form.get("id") as string | null;
    const file = form.get("file") as File | null;
    if (!id || !file) return NextResponse.json({ error: "id and file required" }, { status: 400 });
    const p = await prisma.project.findUnique({ where: { id } });
    if (!p) return NextResponse.json({ error: "project not found" }, { status: 404 });

    const uploadDir = process.env.UPLOAD_DIR || "./uploads";
    await fs.mkdir(uploadDir, { recursive: true });
    const m = file.name.toLowerCase().match(/\.(png|jpe?g|webp|gif|svg)$/);
    const ext = m ? m[0] : ".png";
    const safe = `logo-${id}-${Date.now()}${ext}`;
    const full = path.join(uploadDir, safe);
    await fs.writeFile(full, Buffer.from(await file.arrayBuffer()));

    if (p.logo) fs.unlink(p.logo).catch(() => {});
    await prisma.project.update({ where: { id }, data: { logo: full } });
    return NextResponse.json({ ok: true, logo: full });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
