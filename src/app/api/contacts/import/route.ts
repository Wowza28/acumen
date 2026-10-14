import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import fs from "fs/promises";
import path from "path";
import { parseVcf } from "@/lib/vcf";
import { addContactFields } from "@/lib/contactFields";

// POST /api/contacts/import — multipart form: file (.vcf). Parses and imports contacts.
// Dedupes by email (preferred) then normalized name; skips existing, creates new.
// All emails/phones from each vCard are stored (multi-value); first = default.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
    const text = await file.text();
    const parsed = parseVcf(text);
    if (!parsed.length) return NextResponse.json({ error: "No contacts found in file" }, { status: 400 });

    const uploadDir = process.env.UPLOAD_DIR || "./uploads";
    await fs.mkdir(uploadDir, { recursive: true });

    const existing = await prisma.contact.findMany({ take: 1000, orderBy: { updatedAt: "desc" } });
    const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
    const emailSet = new Set(existing.map((c) => (c.email || "").toLowerCase()).filter(Boolean));
    const nameSet = new Set(existing.map((c) => norm(c.name)));

    let created = 0, skipped = 0;
    const createdNames: string[] = [];

    for (const p of parsed) {
      const email = (p.email || "").toLowerCase();
      if ((email && emailSet.has(email)) || nameSet.has(norm(p.name))) {
        skipped++;
        continue;
      }
      // save photo if present as base64
      let photoPath: string | undefined;
      if (p.photo && "data" in p.photo && p.photo.data) {
        const safe = `photo-import-${Date.now()}-${created}${p.photo.ext}`;
        const full = path.join(uploadDir, safe);
        try {
          await fs.writeFile(full, p.photo.data);
          photoPath = full;
        } catch { /* ignore */ }
      }
      const c = await prisma.contact.create({
        data: {
          name: p.name,
          email: p.email || null,
          phone: p.phone || null,
          company: p.company || null,
          role: p.role || null,
          address: p.address || null,
          photo: photoPath || null
        }
      });
      // store the full set of emails/phones (dedup, first = default)
      await addContactFields(c.id, { emails: p.emails, phones: p.phones });
      created++;
      createdNames.push(c.name);
      // add every email to the dedupe set so later cards with the same email skip
      for (const e of p.emails || []) emailSet.add(e.value.toLowerCase());
      if (email) emailSet.add(email);
      nameSet.add(norm(p.name));
    }

    return NextResponse.json({ ok: true, total: parsed.length, created, skipped, createdNames });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
