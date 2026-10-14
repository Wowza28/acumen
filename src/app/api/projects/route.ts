import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const INCLUDE = { poc: true, contacts: { include: { contact: true } }, tasks: { select: { dueAt: true, status: true } } };
const DETAIL_INCLUDE = {
  poc: true,
  contacts: { include: { contact: true } },
  tasks: { orderBy: { createdAt: "desc" as const } },
  notes: { orderBy: { updatedAt: "desc" as const } },
  documents: { orderBy: { createdAt: "desc" as const } },
};

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const p = await prisma.project.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    return p ? NextResponse.json(p) : NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const list = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" }, take: 100, include: INCLUDE
  });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const title = (b.title || "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  const num = (v: any) => (v === "" || v === null || v === undefined) ? null : Number(v);
  const date = (v: any) => (v ? new Date(v) : null);
  const p = await prisma.project.create({
    data: {
      title,
      company: b.company || null,
      status: ["planned", "active", "complete", "abandoned"].includes(b.status) ? b.status : "planned",
      description: b.description || null,
      inceptionAt: date(b.inceptionAt),
      nextDeadline: date(b.nextDeadline),
      expectedCompletion: date(b.expectedCompletion),
      projectedRevenue: num(b.projectedRevenue),
      revenue: num(b.revenue),
      pocId: b.pocId || null,
    },
    include: INCLUDE,
  });
  // optionally link people at creation
  for (const cid of Array.isArray(b.contactIds) ? b.contactIds : []) {
    await prisma.projectContact.create({ data: { projectId: p.id, contactId: cid } }).catch(() => {});
  }
  const withContacts = await prisma.project.findUnique({ where: { id: p.id }, include: INCLUDE });
  return NextResponse.json(withContacts || p);
}

export async function PATCH(req: NextRequest) {
  const b = await req.json();
  const id = new URL(req.url).searchParams.get("id") || b.id;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const data: any = {};
  for (const k of ["title", "status", "description"]) {
    if (k in b) data[k] = b[k];
  }
  for (const k of ["company", "pocId", "logo"]) {
    if (k in b) data[k] = b[k] === "" ? null : b[k];
  }
  if ("inceptionAt" in b) data.inceptionAt = b.inceptionAt ? new Date(b.inceptionAt) : null;
  if ("nextDeadline" in b) data.nextDeadline = b.nextDeadline ? new Date(b.nextDeadline) : null;
  if ("expectedCompletion" in b) data.expectedCompletion = b.expectedCompletion ? new Date(b.expectedCompletion) : null;
  for (const k of ["projectedRevenue", "revenue"]) {
    if (k in b) data[k] = (b[k] === "" || b[k] === null || b[k] === undefined) ? null : Number(b[k]);
  }
  const u = await prisma.project.update({ where: { id }, data, include: INCLUDE });
  return NextResponse.json(u);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
