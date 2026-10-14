import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTitanAccount } from "@/lib/titanAccount";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contactId") || undefined;
  const projectId = searchParams.get("projectId") || undefined;
  const notes = await prisma.note.findMany({
    where: { contactId, projectId }, orderBy: { createdAt: "desc" }, take: 100
  });
  const docs = await prisma.document.findMany({
    where: { contactId, projectId }, orderBy: { createdAt: "desc" }, take: 50
  });
  // Timeline mail only shows when a Titan account is configured.
  const mailAccount = await getTitanAccount();
  const emails = (contactId && mailAccount)
    ? await prisma.syncedEmail.findMany({ where: { contactId }, orderBy: { createdAt: "desc" }, take: 30 })
    : [];
  return NextResponse.json({ notes, docs, emails });
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const n = await prisma.note.create({
    data: { body: b.body, contactId: b.contactId, projectId: b.projectId, via: b.via || "chat" }
  });
  return NextResponse.json(n);
}
