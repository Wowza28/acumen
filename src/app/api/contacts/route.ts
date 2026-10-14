import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { backfillContactFields } from "@/lib/contactFields";

export async function GET() {
  const list = await prisma.contact.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      contactEmails: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      contactPhones: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }
    }
  });
  // Backfill any legacy contact that has an email/phone column but no rows yet.
  await Promise.all(
    list
      .filter((c) => (c.email || c.phone) && (!c.contactEmails.length || !c.contactPhones.length))
      .map((c) => backfillContactFields(c))
  );
  return NextResponse.json(list);
}
export async function POST(req: NextRequest) {
  const b = await req.json();
  const c = await prisma.contact.create({
    data: { name: b.name, email: b.email, phone: b.phone, company: b.company, role: b.role, address: b.address }
  });
  return NextResponse.json(c);
}
