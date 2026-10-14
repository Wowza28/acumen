import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export type VatSide = "inflow" | "outflow";

function validSide(side: unknown): side is VatSide {
  return side === "inflow" || side === "outflow";
}

export async function GET() {
  try {
    const rules = await prisma.vatExclusion.findMany({ orderBy: [{ createdAt: "asc" }] });
    return NextResponse.json(rules);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load VAT exclusions." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const side = body?.side;
    const pattern = String(body?.pattern ?? "").trim();
    if (!validSide(side)) {
      return NextResponse.json({ error: "Side must be inflow or outflow." }, { status: 400 });
    }
    if (!pattern) {
      return NextResponse.json({ error: "Enter a description string to exclude." }, { status: 400 });
    }
    if (pattern.length > 200) {
      return NextResponse.json({ error: "Exclusion string must be 200 characters or fewer." }, { status: 400 });
    }
    const rule = await prisma.vatExclusion.create({
      data: { side, pattern, enabled: body?.enabled === undefined ? true : !!body.enabled },
    });
    return NextResponse.json(rule);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not save VAT exclusion." }, { status: 500 });
  }
}
