import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import fs from "fs/promises";

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const d = await prisma.document.findUnique({ where: { id } });
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const buf = await fs.readFile(d.path);
    return new NextResponse(buf as any, {
      headers: {
        "Content-Type": d.mime || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(d.filename)}"`
      }
    });
  } catch {
    return NextResponse.json({ error: "file missing on disk" }, { status: 410 });
  }
}
