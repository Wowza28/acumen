import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const KEY = "usdToAedRate";
const DEFAULT_RATE = 3.67;

export async function GET() {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: KEY } });
    const rate = setting ? Number(setting.value) : DEFAULT_RATE;
    return NextResponse.json({ rate: Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_RATE });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load exchange rate." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const rate = Number(body?.rate);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1000) {
      return NextResponse.json({ error: "Enter a valid exchange rate greater than 0." }, { status: 400 });
    }
    const setting = await prisma.appSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: String(rate) },
      update: { value: String(rate) },
    });
    return NextResponse.json({ rate: Number(setting.value) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not save exchange rate." }, { status: 500 });
  }
}
