import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import * as XLSX from "xlsx";

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value ?? "").trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s);
  const n = Number(s.replace(/[(),\s]/g, ""));
  return Number.isFinite(n) ? (negative ? -Math.abs(n) : n) : null;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !isNaN(+value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S);
  }
  const s = String(value ?? "").trim();
  if (!s) return null;
  // Bank statements commonly use DD/MM/YYYY; parse that explicitly to avoid
  // browser/server locale differences. ISO dates and other formats use Date.
  const dmy = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = dmy;
    const date = new Date(+year, +month - 1, +day, +hour, +minute, +second);
    return isNaN(+date) ? null : date;
  }
  const date = new Date(s);
  return isNaN(+date) ? null : date;
}

// POST multipart field `file`: parse statement CSV in memory; the source file
// is never written to disk or added to Documents/Files.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file required." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      return NextResponse.json({ error: "Please upload a CSV statement." }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "CSV must be 20 MB or smaller." }, { status: 413 });
    }

    const workbook = XLSX.read(bytes, { type: "buffer", raw: true, cellDates: true });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) return NextResponse.json({ error: "CSV has no rows." }, { status: 400 });
    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "", raw: true }) as unknown[][];
    if (rows.length < 2) return NextResponse.json({ error: "CSV must contain a header row and transactions." }, { status: 400 });

    const records: Array<{
      currency: string; transactionType: string; transactionDate: Date;
      referenceNumber: string; description: string; amount: number;
      balance: number | null; notes: string | null;
    }> = [];
    const seenInUpload = new Set<string>();
    let skipped = 0;
    let duplicates = 0;
    // Row 1 contains headers. Statement fields are columns F-N (zero-indexed 5-13).
    for (const row of rows.slice(1)) {
      if (!row.some((cell) => String(cell ?? "").trim() !== "")) continue;
      const currency = String(row[5] ?? "").trim().toUpperCase();
      const transactionType = String(row[6] ?? "").trim();
      const transactionDate = parseDate(row[7]);
      const amount = parseAmount(row[10]);
      const referenceNumber = String(row[8] ?? "").trim();
      if (!transactionDate || amount === null || !["AED", "USD"].includes(currency)) {
        skipped++;
        continue;
      }
      if (referenceNumber) {
        const refKey = referenceNumber;
        if (seenInUpload.has(refKey)) { duplicates++; continue; }
        seenInUpload.add(refKey);
      }
      records.push({
        currency,
        transactionType,
        transactionDate,
        referenceNumber,
        description: String(row[9] ?? "").trim(),
        amount,
        balance: parseAmount(row[11]),
        notes: String(row[13] ?? "").trim() || null,
      });
    }

    if (!records.length) {
      return NextResponse.json({ error: "No valid transactions found. Check columns F-L and the date/currency values.", imported: 0, skipped, duplicates }, { status: 400 });
    }

    // Reference number is the statement's transaction identity. Deduplicate by
    // reference alone, both against existing records and within this upload.
    const refs = [...new Set(records.map((r) => r.referenceNumber).filter(Boolean))];
    const existing = refs.length ? await prisma.transaction.findMany({
      where: { referenceNumber: { in: refs } }, select: { referenceNumber: true },
    }) : [];
    const existingRefs = new Set(existing.map((r) => r.referenceNumber));
    const fresh = records.filter((r) => {
      if (!r.referenceNumber) return true;
      if (existingRefs.has(r.referenceNumber)) { duplicates++; return false; }
      existingRefs.add(r.referenceNumber);
      return true;
    });
    // Statement rows are chronological top-to-bottom. Same-day rows share an
    // identical transactionDate/createdAt, so persist the file-row order in
    // `seq` (globally monotonic across uploads) — every consumer tie-breaks
    // on it to keep intra-day order stable.
    const baseSeq = ((await prisma.transaction.aggregate({ _max: { seq: true } }))._max?.seq ?? 0) + 1;
    const result = fresh.length
      ? await prisma.transaction.createMany({ data: fresh.map((r, i) => ({ ...r, seq: baseSeq + i })) })
      : { count: 0 };
    return NextResponse.json({ imported: result.count, skipped, duplicates });
  } catch (e: any) {
    console.error("[transactions/import]", e);
    return NextResponse.json({ error: e?.message || "Could not import statement." }, { status: 500 });
  }
}
