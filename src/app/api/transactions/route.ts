import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      take: 5000,
    });
    return NextResponse.json(transactions);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load transactions." }, { status: 500 });
  }
}
