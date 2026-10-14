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
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { id, ...rest } = b;
  if (rest.dueAt) rest.dueAt = new Date(rest.dueAt);
  if (rest.dueAt === "") rest.dueAt = null;
  const u = await prisma.task.update({ where: { id }, data: rest });
  return NextResponse.json(u);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
