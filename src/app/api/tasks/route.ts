import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const list = await prisma.task.findMany({
    orderBy: { createdAt: "desc" }, take: 200,
    include: { contact: true, project: true }
  });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const t = await prisma.task.create({
    data: {
      title: b.title, description: b.description || "",
      status: ["todo", "in-progress", "done"].includes(b.status) ? b.status : "todo",
      priority: ["low", "medium", "high"].includes(b.priority) ? b.priority : "medium",
      dueAt: b.dueAt ? new Date(b.dueAt) : undefined,
      contactId: b.contactId || null, projectId: b.projectId || null
    }
  });
  return NextResponse.json(t);
}

export async function PATCH(req: NextRequest) {
  const b = await req.json();
  // Bulk mode: { ids: [...], contactId? / projectId? / status? / priority? }
  if (Array.isArray(b.ids)) {
    const ids: string[] = b.ids.filter(Boolean);
    if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
    const data: any = {};
    if (b.contactId !== undefined) data.contactId = b.contactId || null;
    if (b.projectId !== undefined) data.projectId = b.projectId || null;
    if (b.status !== undefined) {
      if (!["todo", "in-progress", "done"].includes(b.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
      data.status = b.status;
    }
    if (b.priority !== undefined) {
      if (!["low", "medium", "high"].includes(b.priority)) return NextResponse.json({ error: "invalid priority" }, { status: 400 });
      data.priority = b.priority;
    }
    if (!Object.keys(data).length) return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    const r = await prisma.task.updateMany({ where: { id: { in: ids } }, data });
    return NextResponse.json({ updated: r.count });
  }
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { id, ...rest } = b;
  if (rest.dueAt) rest.dueAt = new Date(rest.dueAt);
  if (rest.dueAt === "") rest.dueAt = null;
  const u = await prisma.task.update({ where: { id }, data: rest });
  return NextResponse.json(u);
}

export async function DELETE(req: NextRequest) {
  // Bulk mode: DELETE with body { ids: [...] }
  if ((req.headers.get("content-type") || "").includes("application/json")) {
    try {
      const b = await req.json();
      if (Array.isArray(b?.ids) && b.ids.length) {
        const r = await prisma.task.deleteMany({ where: { id: { in: b.ids.filter(Boolean) } } });
        return NextResponse.json({ deleted: r.count });
      }
    } catch { /* fall through to single delete */ }
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
