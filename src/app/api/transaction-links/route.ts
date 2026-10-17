import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncProjectRevenue } from "@/lib/transactionLinks";

// GET /api/transaction-links?transactionId=.. | ?contactId=.. | ?projectId=..
// Returns explicit links (with the joined rows) for the given side.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const transactionId = searchParams.get("transactionId");
  const contactId = searchParams.get("contactId");
  const projectId = searchParams.get("projectId");
  try {
    if (transactionId) {
      const links = await prisma.transactionLink.findMany({
        where: { transactionId },
        include: {
          contact: { select: { id: true, name: true } },
          project: { select: { id: true, title: true } },
          transaction: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ links });
    }
    const where: any = {};
    if (contactId) where.contactId = contactId;
    if (projectId) where.projectId = projectId;
    if (!contactId && !projectId) {
      return NextResponse.json({ error: "pass transactionId, contactId, or projectId" }, { status: 400 });
    }
    const links = await prisma.transactionLink.findMany({
      where,
      include: { transaction: true },
      orderBy: [{ transaction: { transactionDate: "desc" } }, { transaction: { seq: "desc" } }],
    });
    const transactions = links.map((l) => l.transaction);
    return NextResponse.json({ links, transactions });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load transaction links." }, { status: 500 });
  }
}

// POST /api/transaction-links { transactionId, contactId?, projectId? }
// Creates one explicit link (idempotent via upsert).
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const transactionId: string = (b.transactionId || "").trim();
    const contactId: string | undefined = b.contactId || undefined;
    const projectId: string | undefined = b.projectId || undefined;
    if (!transactionId) return NextResponse.json({ error: "pass transactionId" }, { status: 400 });
    if (!contactId && !projectId) {
      return NextResponse.json({ error: "Pass a person (contactId) or a project (projectId) to link to." }, { status: 400 });
    }
    const t = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!t) return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    if (contactId) {
      const c = await prisma.contact.findUnique({ where: { id: contactId } });
      if (!c) return NextResponse.json({ error: "Person not found." }, { status: 404 });
    }
    if (projectId) {
      const p = await prisma.project.findUnique({ where: { id: projectId } });
      if (!p) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const link = await prisma.transactionLink.upsert({
      where: { transactionId_contactId_projectId: { transactionId, contactId: contactId || "", projectId: projectId || "" } },
      update: {},
      create: { transactionId, contactId, projectId },
      include: {
        contact: { select: { id: true, name: true } },
        project: { select: { id: true, title: true } },
      },
    });
    if (projectId) await syncProjectRevenue(projectId);
    return NextResponse.json({ link });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not link transaction." }, { status: 500 });
  }
}

// DELETE /api/transaction-links?id=.. — removes one explicit link.
export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "pass id" }, { status: 400 });
    const link = await prisma.transactionLink.findUnique({ where: { id } });
    await prisma.transactionLink.delete({ where: { id } });
    // Re-sync revenue for the affected project so it reflects the removed link.
    if (link?.projectId) await syncProjectRevenue(link.projectId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not remove transaction link." }, { status: 500 });
  }
}
