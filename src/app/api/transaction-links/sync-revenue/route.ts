import { NextRequest, NextResponse } from "next/server";
import { syncProjectRevenue } from "@/lib/transactionLinks";

// POST /api/transaction-links/sync-revenue { projectId }
// Recomputes a project's Revenue from its directly-linked transactions
// (converted to AED, ÷ 1.05). Called when the project detail page opens so
// the Revenue field is always live and matches the linked-transactions table.
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const projectId = (b?.projectId || "").trim();
    if (!projectId) return NextResponse.json({ error: "pass projectId" }, { status: 400 });
    const revenue = await syncProjectRevenue(projectId);
    return NextResponse.json({ revenue });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not sync revenue." }, { status: 500 });
  }
}
