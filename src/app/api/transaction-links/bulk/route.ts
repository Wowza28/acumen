import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncProjectRevenue } from "@/lib/transactionLinks";

// POST /api/transaction-links/bulk { transactionIds, contactId? , projectId? }
// Links every given transaction to one person and/or project (idempotent
// via upsert, same as the single-link POST) and re-syncs project revenue.
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const ids: string[] = Array.isArray(b?.transactionIds)
      ? [...new Set<string>(b.transactionIds.filter((t: unknown): t is string => typeof t === "string" && t.length > 0))]
      : [];
    const contactId: string | undefined = b?.contactId || undefined;
    const projectId: string | undefined = b?.projectId || undefined;
    if (!ids.length) return NextResponse.json({ error: "pass transactionIds" }, { status: 400 });
    if (!contactId && !projectId) {
      return NextResponse.json({ error: "Pass a person (contactId) or project (projectId) to link to." }, { status: 400 });
    }
    if (contactId && !(await prisma.contact.findUnique({ where: { id: contactId } }))) {
      return NextResponse.json({ error: "Person not found." }, { status: 404 });
    }
    if (projectId && !(await prisma.project.findUnique({ where: { id: projectId } }))) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const rows = await prisma.transaction.findMany({ where: { id: { in: ids } }, select: { id: true } });
    let linked = 0;
    for (const row of rows) {
      await prisma.transactionLink.upsert({
        where: { transactionId_contactId_projectId: { transactionId: row.id, contactId: contactId || "", projectId: projectId || "" } },
        update: {},
        create: { transactionId: row.id, contactId, projectId },
      });
      linked++;
    }
    if (projectId) await syncProjectRevenue(projectId);
    return NextResponse.json({ ok: true, linked, requested: ids.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not link transactions." }, { status: 500 });
  }
}
