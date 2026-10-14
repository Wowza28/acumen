import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTitanAccount, invalidateTitanAccount, setEnvSuppressed } from "@/lib/titanAccount";
import { probeTitanLogin } from "@/lib/titan";
import { reconcileEventLinks } from "@/lib/eventLinks";

// GET /api/settings/titan — status of the single configured Titan account.
// Password is never returned.
export async function GET() {
  try {
    const acct = await getTitanAccount();
    const retainedLinks = acct
      ? await prisma.eventLink.count({ where: { accountEmail: acct.email } })
      : 0;
    return NextResponse.json({
      configured: !!acct,
      email: acct?.email || "",
      source: acct?.source || null,
      retainedLinks,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load Titan account." }, { status: 500 });
  }
}

// PUT /api/settings/titan — save (or replace) the single active account.
// Validates the credentials via a real IMAP login before saving. On a re-add,
// reinstates retained links for events that still exist and drops broken ones.
export async function PUT(req: NextRequest) {
  try {
    const b = await req.json();
    const email = String(b.email || "").trim().toLowerCase();
    const password = String(b.password || "");
    if (!email || !password) {
      return NextResponse.json({ error: "Both email and password are required." }, { status: 400 });
    }

    const probe = await probeTitanLogin(email, password);
    if (!probe.ok) {
      return NextResponse.json({ error: `Titan login failed: ${probe.error}` }, { status: 401 });
    }

    const prev = await getTitanAccount();
    // Enforce a single active account and clear any prior env-suppression.
    await setEnvSuppressed(false);
    await prisma.titanAccount.deleteMany();
    await prisma.titanAccount.create({ data: { email, password } });
    invalidateTitanAccount();

    // Re-adding the same email reinstates its retained links (drop broken ones).
    let reconciled: { retained: number; removed: number } | null = null;
    if (prev?.email === email) {
      reconciled = await reconcileEventLinks(email).catch(() => null);
    }

    return NextResponse.json({ ok: true, email, readded: prev?.email === email, reconciled });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not save Titan account." }, { status: 500 });
  }
}

// DELETE /api/settings/titan?mode=retain|delete
//   retain → remove the account but KEEP its EventLink cache (dormant).
//   delete → remove the account AND its EventLink cache (break all links).
export async function DELETE(req: NextRequest) {
  try {
    const mode = new URL(req.url).searchParams.get("mode") || "retain";
    const acct = await getTitanAccount();
    if (!acct) return NextResponse.json({ error: "No Titan account configured." }, { status: 400 });

    let removedLinks = 0;
    if (mode === "delete") {
      const res = await prisma.eventLink.deleteMany({ where: { accountEmail: acct.email } });
      removedLinks = res.count;
    }
    // Remove the DB row and suppress any .env fallback so the account is
    // genuinely gone (re-adding via PUT clears the suppression).
    await prisma.titanAccount.deleteMany({ where: { email: acct.email } });
    await setEnvSuppressed(true);
    invalidateTitanAccount();

    return NextResponse.json({ ok: true, mode, removedLinks, retainedLinks: mode === "retain" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not delete Titan account." }, { status: 500 });
  }
}
