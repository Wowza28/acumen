import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const data: { pattern?: string; enabled?: boolean; side?: string } = {};
    if (body?.pattern !== undefined) {
      const pattern = String(body.pattern).trim();
      if (!pattern) return NextResponse.json({ error: "Exclusion string cannot be empty." }, { status: 400 });
      if (pattern.length > 200) {
        return NextResponse.json({ error: "Exclusion string must be 200 characters or fewer." }, { status: 400 });
      }
      data.pattern = pattern;
    }
    if (body?.enabled !== undefined) data.enabled = !!body.enabled;
    if (body?.side !== undefined) {
      if (body.side !== "inflow" && body.side !== "outflow") {
        return NextResponse.json({ error: "Side must be inflow or outflow." }, { status: 400 });
      }
      data.side = body.side;
    }
    const rule = await prisma.vatExclusion.update({ where: { id: params.id }, data });
    return NextResponse.json(rule);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not update VAT exclusion." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.vatExclusion.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not delete VAT exclusion." }, { status: 500 });
  }
}
