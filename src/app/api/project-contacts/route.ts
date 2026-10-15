import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Manual Person <-> Project links (ProjectContact join rows). The same rows
// feed the person page's Projects subtab AND the project page's People
// section, so linking from either side shows up on both automatically.
// The /api/projects include already ships `contacts: { include: contact }`.

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const projectId = typeof b.projectId === "string" ? b.projectId : "";
    const contactId = typeof b.contactId === "string" ? b.contactId : "";
    if (!projectId || !contactId) {
      return NextResponse.json({ error: "projectId and contactId required" }, { status: 400 });
    }
    const [project, contact] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }),
      prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } }),
    ]);
    if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });
    if (!contact) return NextResponse.json({ error: "contact not found" }, { status: 404 });
    const existing = await prisma.projectContact.findFirst({ where: { projectId, contactId } });
    if (existing) return NextResponse.json({ ok: true, already: true });
    await prisma.projectContact.create({ data: { projectId, contactId } });
    return NextResponse.json({ ok: true, linked: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not link." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const projectId = sp.get("projectId") || "";
    const contactId = sp.get("contactId") || "";
    if (!projectId || !contactId) {
      return NextResponse.json({ error: "projectId and contactId required" }, { status: 400 });
    }
    await prisma.projectContact.deleteMany({ where: { projectId, contactId } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not unlink." }, { status: 500 });
  }
}