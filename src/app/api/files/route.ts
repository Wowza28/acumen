import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveStoredPath } from "@/lib/filePaths";
import fs from "fs/promises";

export async function GET() {
  const docs = await prisma.document.findMany({
    orderBy: { createdAt: "desc" }, take: 200,
    include: { contact: true, project: true }
  });
  return NextResponse.json(docs.map((d) => ({
    id: d.id, filename: d.filename, mime: d.mime, size: d.size,
    summary: d.summary, tag: (d as any).tag || null, contactId: d.contactId, projectId: d.projectId,
    contact: d.contact ? { id: d.contact.id, name: d.contact.name } : null,
    project: d.project ? { id: d.project.id, title: d.project.title } : null,
    createdAt: d.createdAt, updatedAt: d.updatedAt
  })));
}

export async function PATCH(req: NextRequest) {
  const b = await req.json();

  const allowed = ["Invoice", "Agreement", "KYC"];
  const updates: Record<string, string | null> = {};
  if (b.contactId !== undefined) updates.contactId = b.contactId || null;
  if (b.projectId !== undefined) updates.projectId = b.projectId || null;
  if (b.tag !== undefined) {
    const t = (b.tag || "").toString().trim();
    if (t && !allowed.includes(t)) {
      return NextResponse.json({ error: "invalid tag — use Invoice, Agreement, or KYC" }, { status: 400 });
    }
    updates.tag = t || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "no update fields provided" },
      { status: 400 }
    );
  }

  // Bulk mode: { ids: [...], contactId? / projectId? / tag? }
  if (Array.isArray(b.ids)) {
    const ids: string[] = b.ids.filter(Boolean);
    if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
    const r = await prisma.document.updateMany({ where: { id: { in: ids } }, data: updates });
    return NextResponse.json({ updated: r.count });
  }

  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const u = await prisma.document.update({
    where: { id: b.id },
    data: updates,
  });
  return NextResponse.json(u);
}

export async function DELETE(req: NextRequest) {
  // Bulk mode: DELETE with body { ids: [...] } — removes rows, index chunks,
  // and the stored files for every id.
  if ((req.headers.get("content-type") || "").includes("application/json")) {
    try {
      const b = await req.json();
      if (Array.isArray(b?.ids) && b.ids.length) {
        const ids: string[] = b.ids.filter(Boolean);
        const docs = await prisma.document.findMany({ where: { id: { in: ids } } });
        await prisma.docChunk.deleteMany({ where: { documentId: { in: ids } } });
        await prisma.document.deleteMany({ where: { id: { in: ids } } });
        for (const d of docs) {
          try { await fs.unlink(resolveStoredPath(d.path)); } catch {}
        }
        return NextResponse.json({ deleted: docs.length });
      }
    } catch { /* fall through to single delete */ }
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const d = await prisma.document.findUnique({ where: { id } });
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.docChunk.deleteMany({ where: { documentId: id } });
  await prisma.document.delete({ where: { id } });
  try { await fs.unlink(resolveStoredPath(d.path)); } catch {}
  return NextResponse.json({ ok: true });
}
