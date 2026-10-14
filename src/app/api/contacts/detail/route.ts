import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { backfillContactFields, applyContactExtras, normalizeContactFieldArgs } from "@/lib/contactFields";

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const c = await prisma.contact.findUnique({
    where: { id },
    include: {
      projects: { include: { project: true } },
      notes: { orderBy: { createdAt: "desc" }, take: 30 },
      documents: { orderBy: { createdAt: "desc" }, take: 30 },
      emails: { orderBy: { createdAt: "desc" }, take: 30 },
      contactEmails: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      contactPhones: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }
    }
  });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Backfill legacy single email/phone into the multi-value tables once.
  if ((c.email || c.phone) && (!c.contactEmails.length || !c.contactPhones.length)) {
    await backfillContactFields(c);
  }
  return NextResponse.json(c);
}

export async function PATCH(req: NextRequest) {
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { id, emails, phones, set_default_email, set_default_phone, ...data } = b;
  // Scalar name/company/role/address update.
  if (Object.keys(data).length) {
    await prisma.contact.update({ where: { id }, data });
  }
  // Email/phone edits go through the multi-value helpers so the default column
  // stays in sync and duplicates are avoided.
  const hasFieldOps = emails?.length || phones?.length || set_default_email || set_default_phone || "email" in b || "phone" in b;
  if (hasFieldOps) {
    const { emails: normEmails, phones: normPhones } = normalizeContactFieldArgs({ ...b, emails, phones });
    await applyContactExtras(id, {
      emails: normEmails,
      phones: normPhones,
      set_default_email,
      set_default_phone
    });
  }
  const u = await prisma.contact.findUnique({
    where: { id },
    include: {
      contactEmails: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      contactPhones: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }
    }
  });
  return NextResponse.json(u);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.contact.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
