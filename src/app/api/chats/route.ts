import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const list = await prisma.chat.findMany({ orderBy: { updatedAt: "desc" }, take: 50 });
  return NextResponse.json(list);
}

export async function POST() {
  const c = await prisma.chat.create({ data: { title: "New chat" } });
  return NextResponse.json(c);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.chat.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
