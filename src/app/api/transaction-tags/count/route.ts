import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/transaction-tags/count?description= — how many rows share this
// exact description (used by the drawer to preview bulk-tag propagation).
export async function GET(req: Request) {
  const description = new URL(req.url).searchParams.get("description") || "";
  const count = await prisma.transaction.count({ where: { description } });
  return NextResponse.json({ count });
}