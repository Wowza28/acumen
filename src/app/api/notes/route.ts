import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const list = await prisma.note.findMany({
    orderBy: { createdAt: "desc" }, take: 200,
    include: { contact: true, project: true }
  });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const n = await prisma.note.create({
    data: { title: b.title || "Untitled", body: b.body || "", contactId: b.contactId || null, projectId: b.projectId || null, via: b.via || "chat" }
  });
  return NextResponse.json(n);
}

export async function PATCH(req: NextRequest) {
  const b = await req.json();
  // Bulk mode: { ids: [...], contactId? / projectId? }
  if (Array.isArray(b.ids)) {
    const ids: string[] = b.ids.filter(Boolean);
    if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
    const data: any = {};
    if (b.contactId !== undefined) data.contactId = b.contactId || null;
    if (b.projectId !== undefined) data.projectId = b.projectId || null;
    if (!Object.keys(data).length) return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    const r = await prisma.note.updateMany({ where: { id: { in: ids } }, data });
    return NextResponse.json({ updated: r.count });
  }
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const u = await prisma.note.update({
    where: { id: b.id },
    data: { title: b.title, body: b.body, contactId: b.contactId || null, projectId: b.projectId || null }
  });
  return NextResponse.json(u);
}

export async function DELETE(req: NextRequest) {
  // Bulk mode: DELETE with body { ids: [...] }
  if ((req.headers.get("content-type") || "").includes("application/json")) {
    try {
      const b = await req.json();
      if (Array.isArray(b?.ids) && b.ids.length) {
        const r = await prisma.note.deleteMany({ where: { id: { in: b.ids.filter(Boolean) } } });
        return NextResponse.json({ deleted: r.count });
      }
    } catch { /* fall through to single delete */ }
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.note.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
