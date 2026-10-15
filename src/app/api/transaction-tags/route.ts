import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const ALLOWED = new Set([
  "Revenue", "Fees", "Project", "Expense", "Food", "Fuel", "Salary", "Parking", "Transfer",
]);

function cleanTags(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.filter((t): t is string => typeof t === "string" && ALLOWED.has(t)))];
  return out;
}

function parseStored(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string" && ALLOWED.has(t)) : [];
  } catch {
    return [];
  }
}

// PATCH { id, add?, remove?, set? } — single-transaction edit.
// { description, add?, remove?, set? } — bulk edit across EVERY transaction
// with the exact same description (auto-tag propagation).
// add/remove are merged per-row (union/difference); set replaces wholesale.
export async function PATCH(req: NextRequest) {
  try {
    const b = await req.json();
    const add = b.add !== undefined ? cleanTags(b.add) : undefined;
    const remove = b.remove !== undefined ? cleanTags(b.remove) : undefined;
    const set = b.set !== undefined ? cleanTags(b.set) : undefined;
    if (add === null || remove === null || set === null) {
      return NextResponse.json({ error: "tags must be an array of valid category names" }, { status: 400 });
    }
    if (add === undefined && remove === undefined && set === undefined) {
      return NextResponse.json({ error: "nothing to change — pass add, remove, or set" }, { status: 400 });
    }

    // Bulk-by-ids: an explicit set of transaction ids (any descriptions).
    if (Array.isArray(b.ids)) {
      const ids: string[] = [...new Set<string>(b.ids.filter((t: unknown): t is string => typeof t === "string" && t.length > 0))];
      const rows = ids.length ? await prisma.transaction.findMany({
        where: { id: { in: ids } }, select: { id: true, tags: true },
      }) : [];
      let updated = 0;
      for (const r of rows) {
        let next: string[];
        if (set !== undefined) next = set;
        else {
          const cur = new Set(parseStored(r.tags));
          for (const t of add || []) cur.add(t);
          for (const t of remove || []) cur.delete(t);
          next = [...cur];
        }
        await prisma.transaction.update({ where: { id: r.id }, data: { tags: JSON.stringify(next) } });
        updated++;
      }
      return NextResponse.json({ ok: true, updated, tags: set !== undefined ? set : undefined });
    }

    // Bulk mode: every transaction sharing this exact description.
    if (typeof b.description === "string") {
      const rows = await prisma.transaction.findMany({
        where: { description: b.description }, select: { id: true, tags: true },
      });
      let updated = 0;
      for (const r of rows) {
        let next: string[];
        if (set !== undefined) next = set;
        else {
          const cur = new Set(parseStored(r.tags));
          for (const t of add || []) cur.add(t);
          for (const t of remove || []) cur.delete(t);
          next = [...cur];
        }
        await prisma.transaction.update({ where: { id: r.id }, data: { tags: JSON.stringify(next) } });
        updated++;
      }
      return NextResponse.json({ ok: true, updated, tags: set !== undefined ? set : undefined });
    }

    if (typeof b.id !== "string" || !b.id) {
      return NextResponse.json({ error: "id or description required" }, { status: 400 });
    }
    const cur = await prisma.transaction.findUnique({ where: { id: b.id }, select: { id: true, tags: true } });
    if (!cur) return NextResponse.json({ error: "not found" }, { status: 404 });
    let next: string[];
    if (set !== undefined) next = set;
    else {
      const s = new Set(parseStored(cur.tags));
      for (const t of add || []) s.add(t);
      for (const t of remove || []) s.delete(t);
      next = [...s];
    }
    const u = await prisma.transaction.update({ where: { id: cur.id }, data: { tags: JSON.stringify(next) } });
    return NextResponse.json({ ok: true, tags: next, updated: 1, id: u.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not update tags." }, { status: 500 });
  }
}
