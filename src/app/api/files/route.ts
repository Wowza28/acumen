import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import fs from "fs/promises";

export async function GET() {
  const docs = await prisma.document.findMany({
    orderBy: { createdAt: "desc" }, take: 200,
    include: { contact: true, project: true }
  });
  return NextResponse.json(docs.map((d) => ({
    id: d.id, filename: d.filename, mime: d.mime, size: d.size,
    summary: d.summary, contactId: d.contactId, projectId: d.projectId,
    contact: d.contact ? { id: d.contact.id, name: d.contact.name } : null,
    project: d.project ? { id: d.project.id, title: d.project.title } : null,
    createdAt: d.createdAt, updatedAt: d.updatedAt
  })));
}

export async function PATCH(req: NextRequest) {
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Only update fields actually sent in the request body, so linking a file
  // to a Person / Project never clears the other link.
  const updates: Record<string, string | null> = {};
  if (b.contactId !== undefined) updates.contactId = b.contactId || null;
  if (b.projectId !== undefined) updates.projectId = b.projectId || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "no update fields provided" },
      { status: 400 }
    );
  }

  const u = await prisma.document.update({
    where: { id: b.id },
    data: updates,
  });
  return NextResponse.json(u);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const d = await prisma.document.findUnique({ where: { id } });
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.docChunk.deleteMany({ where: { documentId: id } });
  await prisma.document.delete({ where: { id } });
  try { await fs.unlink(d.path); } catch {}
  return NextResponse.json({ ok: true });
}
