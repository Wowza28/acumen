import { prisma } from "./db";

// ---------- multi email/phone helpers ----------
// Contact.email / Contact.phone remain the "default" value (denormalized) so all
// existing fuzzy-matching, dedupe, tables and AI tools keep working unchanged.
// The full set lives in ContactEmail / ContactPhone with an isDefault flag.

/** Recompute and persist the default email column from ContactEmail rows. */
export async function syncDefaultEmail(contactId: string) {
  const rows = await prisma.contactEmail.findMany({
    where: { contactId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
  });
  const def = rows.find((r) => r.isDefault) || rows[0] || null;
  await prisma.contact.update({ where: { id: contactId }, data: { email: def ? def.value : null } });
  return def;
}

/** Recompute and persist the default phone column from ContactPhone rows. */
export async function syncDefaultPhone(contactId: string) {
  const rows = await prisma.contactPhone.findMany({
    where: { contactId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
  });
  const def = rows.find((r) => r.isDefault) || rows[0] || null;
  await prisma.contact.update({ where: { id: contactId }, data: { phone: def ? def.value : null } });
  return def;
}

/**
 * Add several emails/phones to a contact (dedup by value, case-insensitive),
 * then re-sync the default columns. If the contact has none yet, the first one
 * added becomes the default. A new item explicitly marked `isDefault` is pushed
 * as the default via setContactFieldDefault (which clears the others).
 * Returns counts of newly added values.
 */
export async function addContactFields(
  contactId: string,
  opts: {
    emails?: { value: string; label?: string; isDefault?: boolean }[];
    phones?: { value: string; label?: string; isDefault?: boolean }[];
  }
) {
  const existingEmails = await prisma.contactEmail.findMany({ where: { contactId } });
  const existingPhones = await prisma.contactPhone.findMany({ where: { contactId } });
  const emailSet = new Set(existingEmails.map((e) => e.value.toLowerCase()));
  const phoneSet = new Set(existingPhones.map((p) => p.value.toLowerCase()));
  let emailsAdded = 0, phonesAdded = 0;
  let emailDefaultReq = false, phoneDefaultReq = false;

  let markEmailDefault = !existingEmails.length;
  for (const e of opts.emails || []) {
    const v = (e.value || "").trim();
    if (!v || emailSet.has(v.toLowerCase())) continue;
    const first = markEmailDefault;
    await prisma.contactEmail.create({
      data: { contactId, value: v, label: e.label || null, isDefault: first || !!e.isDefault }
    });
    emailSet.add(v.toLowerCase());
    markEmailDefault = false;
    if (e.isDefault) emailDefaultReq = true;
    emailsAdded++;
  }

  let markPhoneDefault = !existingPhones.length;
  for (const p of opts.phones || []) {
    const v = (p.value || "").trim();
    if (!v || phoneSet.has(v.toLowerCase())) continue;
    const first = markPhoneDefault;
    await prisma.contactPhone.create({
      data: { contactId, value: v, label: p.label || null, isDefault: first || !!p.isDefault }
    });
    phoneSet.add(v.toLowerCase());
    markPhoneDefault = false;
    if (p.isDefault) phoneDefaultReq = true;
    phonesAdded++;
  }

  // Honor an explicit "make this one default" by clearing the others.
  if (emailDefaultReq) {
    const def = (opts.emails || []).find((e) => e.isDefault);
    if (def) await setDefaultByValue(contactId, "email", def.value);
  }
  if (phoneDefaultReq) {
    const def = (opts.phones || []).find((p) => p.isDefault);
    if (def) await setDefaultByValue(contactId, "phone", def.value);
  }
  // Otherwise just make sure exactly one default exists per kind, then sync.
  if (!emailDefaultReq && emailsAdded) await syncDefaultEmail(contactId);
  if (!phoneDefaultReq && phonesAdded) await syncDefaultPhone(contactId);
  return { emailsAdded, phonesAdded };
}

/**
 * Backfill legacy single email/phone into the new tables for contacts that
 * predate multi-value support. Safe to call repeatedly.
 */
export async function backfillContactFields(contact: { id: string; email: string | null; phone: string | null }) {
  const [eCount, pCount] = await Promise.all([
    prisma.contactEmail.count({ where: { contactId: contact.id } }),
    prisma.contactPhone.count({ where: { contactId: contact.id } })
  ]);
  if (!eCount && contact.email) {
    await prisma.contactEmail.create({ data: { contactId: contact.id, value: contact.email, isDefault: true } });
  }
  if (!pCount && contact.phone) {
    await prisma.contactPhone.create({ data: { contactId: contact.id, value: contact.phone, isDefault: true } });
  }
}

const KIND_MODEL = { email: prisma.contactEmail, phone: prisma.contactPhone } as const;
type Kind = keyof typeof KIND_MODEL;

/** Set a specific row (by id) as the default for its kind, clearing the rest. */
export async function setContactFieldDefault(rowId: string, kind: Kind) {
  const model = KIND_MODEL[kind] as any;
  const row = await model.findUnique({ where: { id: rowId } });
  if (!row) return false;
  await model.updateMany({ where: { contactId: row.contactId, isDefault: true }, data: { isDefault: false } });
  await model.update({ where: { id: rowId }, data: { isDefault: true } });
  if (kind === "email") await syncDefaultEmail(row.contactId);
  else await syncDefaultPhone(row.contactId);
  return true;
}

/** Set a row as default by matching its value (case-insensitive). */
export async function setDefaultByValue(contactId: string, kind: Kind, value: string) {
  const model = KIND_MODEL[kind] as any;
  const rows = await model.findMany({ where: { contactId } });
  const target = rows.find((r: any) => r.value.toLowerCase() === value.trim().toLowerCase());
  if (!target) return false;
  await setContactFieldDefault(target.id, kind);
  return true;
}

/** Remove a row; if it was the default, promote the next-oldest then re-sync. */
export async function removeContactField(rowId: string, kind: Kind) {
  const model = KIND_MODEL[kind] as any;
  const row = await model.findUnique({ where: { id: rowId } });
  if (!row) return false;
  const contactId = row.contactId as string;
  const wasDefault = !!row.isDefault;
  await model.delete({ where: { id: rowId } });
  if (wasDefault) {
    // Promote the oldest surviving row to default: clear stale flags, then
    // set isDefault on it (syncDefault* falls back to first row but does NOT
    // flip the flag, which the UI reads to draw the D badge).
    await (model as any).updateMany({ where: { contactId }, data: { isDefault: false } });
    const next = await model.findFirst({ where: { contactId }, orderBy: { createdAt: "asc" } });
    if (next) await model.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  if (kind === "email") await syncDefaultEmail(contactId);
  else await syncDefaultPhone(contactId);
  return true;
}

/** Update a row's value and/or label, then re-sync the default columns. */
export async function updateContactFieldValue(rowId: string, kind: Kind, patch: { value?: string; label?: string }) {
  const model = KIND_MODEL[kind] as any;
  const data: any = {};
  if (patch.value !== undefined) {
    const v = patch.value.trim();
    if (!v) throw new Error("value cannot be empty");
    data.value = v;
  }
  if (patch.label !== undefined) data.label = patch.label?.trim() || null;
  const row = await model.update({ where: { id: rowId }, data });
  if (kind === "email") await syncDefaultEmail(row.contactId);
  else await syncDefaultPhone(row.contactId);
  return row;
}

/** Return a contact's emails/phones arrays (default first) for display. */
export async function getContactFields(contactId: string) {
  const [emails, phones] = await Promise.all([
    prisma.contactEmail.findMany({ where: { contactId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
    prisma.contactPhone.findMany({ where: { contactId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] })
  ]);
  return { emails, phones };
}

/**
 * Combined helper used by chat tools + APIs: add any new emails/phones, then
 * optionally set the default for a kind by value. Always re-syncs the
 * denormalized Contact.email/phone columns so tables/fuzzy-match stay correct.
 */
export async function applyContactExtras(
  contactId: string,
  opts: {
    emails?: { value: string; label?: string; isDefault?: boolean }[];
    phones?: { value: string; label?: string; isDefault?: boolean }[];
    set_default_email?: string;
    set_default_phone?: string;
  }
) {
  const added: { emailsAdded: number; phonesAdded: number } =
    (opts.emails?.length || opts.phones?.length)
      ? await addContactFields(contactId, { emails: opts.emails, phones: opts.phones })
      : { emailsAdded: 0, phonesAdded: 0 };
  if (opts.set_default_email) await setDefaultByValue(contactId, "email", opts.set_default_email);
  if (opts.set_default_phone) await setDefaultByValue(contactId, "phone", opts.set_default_phone);
  // If default-email/phone were set only via array isDefault flags, addContactFields
  // already handled it; still re-sync to be safe.
  if (!opts.set_default_email) await syncDefaultEmail(contactId);
  if (!opts.set_default_phone) await syncDefaultPhone(contactId);
  return added;
}

/** Build emails[]/phones[] from a tool's single + array args (dedup within input). */
export function normalizeContactFieldArgs(args: any): {
  emails: { value: string; label?: string; isDefault?: boolean }[];
  phones: { value: string; label?: string; isDefault?: boolean }[];
} {
  const emails: { value: string; label?: string; isDefault?: boolean }[] = [];
  const phones: { value: string; label?: string; isDefault?: boolean }[] = [];
  const push = (arr: any[], item: any) => {
    const v = String(item?.value ?? item ?? "").trim();
    if (!v) return;
    if (arr.some((x) => x.value.toLowerCase() === v.toLowerCase())) return;
    arr.push({
      value: v,
      ...(item && typeof item === "object" && item.label ? { label: item.label } : {}),
      ...(item && typeof item === "object" && item.isDefault ? { isDefault: true } : {})
    });
  };
  if (args.email) push(emails, { value: args.email, isDefault: true });
  (args.emails || []).forEach((e: any) => push(emails, e));
  if (args.phone) push(phones, { value: args.phone, isDefault: true });
  (args.phones || []).forEach((p: any) => push(phones, p));
  return { emails, phones };
}
