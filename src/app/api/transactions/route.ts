import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const transactions = await prisma.transaction.findMany({
      // Latest-first ledger: dates desc, and same-day rows in reverse CSV
      // order (the day's last statement row is the "latest" transaction).
      // id desc is the fallback for legacy rows imported before `seq` existed.
      orderBy: [{ transactionDate: "desc" }, { seq: "desc" }, { id: "desc" }],
      take: 5000,
    });
    return NextResponse.json(transactions);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load transactions." }, { status: 500 });
  }
}

// DELETE { ids: string[] } — remove transactions (TransactionLink rows cascade
// via onDelete). Projects that had linked rows are re-synced afterwards so
// their Revenue figure stays correct.
export async function DELETE(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(b?.ids)
      ? [...new Set<string>(b.ids.filter((t: unknown): t is string => typeof t === "string" && t.length > 0))]
      : [];
    if (!ids.length) return NextResponse.json({ error: "pass ids" }, { status: 400 });
    const links = await prisma.transactionLink.findMany({
      where: { transactionId: { in: ids } }, select: { projectId: true },
    });
    const projectIds = [...new Set(links.map((l) => l.projectId).filter((p): p is string => !!p))];
    const res = await prisma.transaction.deleteMany({ where: { id: { in: ids } } });
    if (projectIds.length) {
      const { syncProjectRevenue } = await import("@/lib/transactionLinks");
      for (const pid of projectIds) {
        try { await syncProjectRevenue(pid); } catch { /* best-effort re-sync */ }
      }
    }
    return NextResponse.json({ ok: true, deleted: res.count });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not delete transactions." }, { status: 500 });
  }
}
