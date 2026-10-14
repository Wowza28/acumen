import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const c = await prisma.chat.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } } });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(c);
}

export async function PATCH(req: NextRequest) {
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const u = await prisma.chat.update({ where: { id: b.id }, data: { title: b.title } });
  return NextResponse.json(u);
}
