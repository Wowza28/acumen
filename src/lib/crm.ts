import { prisma } from "./db";
import { applyContactExtras, normalizeContactFieldArgs } from "./contactFields";
import { activeAccountEmail } from "./titanAccount";

// ---------- fuzzy matching: "George from Bucor" -> George Carlin @ Bucor Capital ----------
function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(s: string): string[] {
  return norm(s).split(" ").filter((t) => t.length > 1);
}

function allEmails(c: any): string[] {
  const out: string[] = [];
  if (c.email) out.push(String(c.email).toLowerCase());
  for (const r of c.contactEmails || []) {
    const v = String(r?.value || "").toLowerCase();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function allPhones(c: any): string[] {
  const out: string[] = [];
  if (c.phone) out.push(String(c.phone).toLowerCase());
  for (const r of c.contactPhones || []) {
    const v = String(r?.value || "").toLowerCase();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function allEmailsPhones(c: any): { emails: string[]; phones: string[] } {
  return { emails: allEmails(c), phones: allPhones(c) };
}

function scoreContact(query: string, c: { name: string; company: string | null; email: string | null }): number {
  const qt = tokens(query);
  if (!qt.length) return 0;
  const nameT = tokens(c.name);
  const compT = tokens(c.company || "");
  const email = (c.email || "").toLowerCase();
  let score = 0;
  for (const t of qt) {
    if (nameT.includes(t)) score += 3; // exact first/last name hit
    else if (nameT.some((n) => n.startsWith(t) || t.startsWith(n))) score += 1.5;
    if (compT.includes(t)) score += 2; // company word hit
    else if (compT.some((n) => n.startsWith(t) || t.startsWith(n))) score += 1;
    if (email.includes(t) && t.length > 2) score += 2.5;
  }
  // secondary (non-default) emails/phones: same email hit weight so any
  // known address can identify the person
  const ql = query.toLowerCase();
  for (const e of allEmails(c)) {
    if (e === ql) { score += 3; break; }
    if (e && ql.length > 3 && (e.includes(ql) || ql.includes(e))) { score += 2.5; break; }
  }
  for (const p of allPhones(c)) {
    const digits = (s: string) => s.replace(/\D/g, "");
    const pd = digits(p), qd = digits(ql);
    if (pd && qd && (pd === qd || (qd.length >= 7 && pd.endsWith(qd)) || (pd.length >= 7 && qd.endsWith(pd)))) { score += 3; break; }
  }
  // penalize queries that mention words matching nothing
  return score;
}

// Parse helpers for project numeric/date fields (AED money + ISO dates).
// Empty string / null / undefined -> null (cleared). Invalid number -> null.
function numOrNull(v: any): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function dateOrNull(v: any): Date | null {
  if (v === "" || v === null || v === undefined) return null;
  const d = new Date(v);
  return isNaN(+d) ? null : d;
}

export async function resolveContact(query?: string) {
  if (!query?.trim()) return { contact: null, candidates: [] as any[] };
  const q = query.trim();
  // fast path: exact id / email
  const byId = await prisma.contact.findUnique({
    where: { id: q },
    include: {
      contactEmails: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      contactPhones: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }
    }
  }).catch(() => null);
  if (byId) return { contact: byId, candidates: [byId] };
  // fast path: exact secondary email/phone (any row, not just default)
  const ql = q.toLowerCase();
  const qd = q.replace(/\D/g, "");
  const byRow = await prisma.contact.findFirst({
    where: {
      OR: [
        { contactEmails: { some: { value: q } } },
        { contactEmails: { some: { value: ql } } },
        ...(qd ? [{ contactPhones: { some: { value: q } } } as any] : [])
      ]
    },
    include: {
      contactEmails: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      contactPhones: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }
    }
  }).catch(() => null);
  if (byRow) return { contact: byRow, candidates: [byRow] };
  const all = await prisma.contact.findMany({
    take: 200,
    orderBy: { updatedAt: "desc" },
    include: {
      contactEmails: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      contactPhones: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }
    }
  });
  const scored = all
    .map((c) => ({ c, s: scoreContact(q, c) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  if (!scored.length) return { contact: null, candidates: [] };
  // confident if top score >= 3 (a real name hit) and clearly ahead, or exact full-name match
  const top = scored[0];
  const exactName = all.find((c) => norm(c.name) === norm(q));
  if (exactName) return { contact: exactName, candidates: scored.slice(0, 3).map((x) => x.c) };
  if (top.s >= 3 && (scored.length === 1 || top.s - scored[1].s >= 1.5)) {
    return { contact: top.c, candidates: scored.slice(0, 3).map((x) => x.c) };
  }
  // ambiguous: return candidates for the agent to ask about
  return { contact: null, candidates: scored.slice(0, 3).map((x) => x.c) };
}

// ---------- task resolution: "that task" / recent-task context ----------
export async function resolveTask(query?: string, history?: string) {
  const q = (query || "").trim();
  const refWords = ["that task", "this task", "the task", "it ", "its ", "same task"];
  const isRef = !q || refWords.some((w) => q.toLowerCase().includes(w));
  if (isRef) {
    // most recently created/updated task overall, or matching history keywords
    const recent = await prisma.task.findMany({ take: 5, orderBy: { updatedAt: "desc" }, include: { contact: true, project: true } });
    if (!recent.length) return { task: null, candidates: [] as any[] };
    if (history) {
      const ht = tokens(history);
      const scored = recent.map((t) => ({
        t,
        s: tokens(t.title).filter((w) => ht.includes(w)).length
      })).sort((a, b) => b.s - a.s);
      if (scored[0].s > 0) return { task: scored[0].t, candidates: recent.slice(0, 3) };
    }
    return { task: recent[0], candidates: recent.slice(0, 3) };
  }
  const list = await prisma.task.findMany({ take: 50, orderBy: { updatedAt: "desc" } });
  const lower = q.toLowerCase();
  const hits = list.filter((t) => t.title.toLowerCase().includes(lower) || lower.includes(t.title.toLowerCase().split(" ")[0]));
  if (hits.length === 1) return { task: hits[0], candidates: hits };
  if (hits.length > 1) return { task: null, candidates: hits.slice(0, 3) };
  return { task: null, candidates: [] };
}

// ---------- note resolution (same "that note" pattern) ----------
export async function resolveNote(query?: string) {
  const q = (query || "").trim();
  if (!q || /that note|this note|the note|it\b/i.test(q)) {
    const recent = await prisma.note.findMany({ take: 3, orderBy: { updatedAt: "desc" } });
    return { note: recent[0] || null, candidates: recent };
  }
  const list = await prisma.note.findMany({ take: 50, orderBy: { updatedAt: "desc" } });
  const lower = q.toLowerCase();
  const hits = list.filter((n) => (n.title || "").toLowerCase().includes(lower));
  if (hits.length === 1) return { note: hits[0], candidates: hits };
  if (hits.length > 1) return { note: null, candidates: hits.slice(0, 3) };
  return { note: null, candidates: [] };
}

export async function findContact(name?: string) {
  if (!name) return null;
  const q = name.trim();
  if (!q) return null;
  const withRows = {
    contactEmails: { orderBy: [{ isDefault: "desc" as const }, { createdAt: "asc" as const }] },
    contactPhones: { orderBy: [{ isDefault: "desc" as const }, { createdAt: "asc" as const }] }
  };
  // exact id match first
  const byId = await prisma.contact.findUnique({ where: { id: q }, include: withRows }).catch(() => null);
  if (byId) return byId;
  // exact email / phone match (default OR any secondary row)
  const byEmail = await prisma.contact.findFirst({ where: { email: q }, include: withRows }).catch(() => null);
  if (byEmail) return byEmail;
  const byRow = await prisma.contact.findFirst({
    where: { OR: [{ contactEmails: { some: { value: q } } }, { contactEmails: { some: { value: q.toLowerCase() } } }, { contactPhones: { some: { value: q } } }] },
    include: withRows
  }).catch(() => null);
  if (byRow) return byRow;
  // exact name (case-insensitive)
  const all = await prisma.contact.findMany({ take: 200, include: withRows });
  const lower = q.toLowerCase();
  return all.find((c) => c.name.toLowerCase() === lower)
    ?? all.find((c) => c.name.toLowerCase().includes(lower))
    ?? null;
}

export async function searchContacts(q: string) {
  const query = (q || "").trim();
  if (!query) return [];
  const like = { contains: query } as const;
  // SQLite contains is case-sensitive-ish; also do in-memory filter for safety
  const list = await prisma.contact.findMany({
    take: 100,
    orderBy: { updatedAt: "desc" },
    include: {
      contactEmails: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      contactPhones: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }
    }
  });
  const lower = query.toLowerCase();
  return list.filter((c) => {
    if (c.name.toLowerCase().includes(lower)) return true;
    if ((c.email || "").toLowerCase().includes(lower)) return true;
    if ((c.phone || "").includes(query)) return true;
    if ((c.company || "").toLowerCase().includes(lower)) return true;
    // secondary (non-default) emails/phones
    if (allEmails(c).some((e) => e.includes(lower))) return true;
    if (allPhones(c).some((p) => p.includes(query.toLowerCase()))) return true;
    return false;
  }).slice(0, 10);
}
export async function searchProjects(q: string) {
  const query = (q || "").trim();
  if (!query) return [];
  const all = await prisma.project.findMany({ take: 100, orderBy: { updatedAt: "desc" } });
  const lower = query.toLowerCase();
  const nq = norm(lower);
  return all
    .map((p) => {
      const t = norm(p.title);
      const c = norm(p.company || "");
      let s = 0;
      if (t === nq) s += 6;
      else if (t.includes(nq) || nq.includes(t)) s += 4;
      for (const tok of tokens(query)) {
        if (t.includes(tok)) s += 2;
        else if (c.includes(tok)) s += 1;
      }
      return { p, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 10)
    .map((x) => x.p);
}

// Resolve a project reference to ONE confident match, or report ambiguity.
// Mirrors resolveContact: returns { project, candidates }.
export async function resolveProject(query?: string) {
  if (!query?.trim()) return { project: null, candidates: [] as any[] };
  const q = query.trim();
  const byId = await prisma.project.findUnique({ where: { id: q } }).catch(() => null);
  if (byId) return { project: byId, candidates: [byId] };
  const all = await prisma.project.findMany({ take: 200, orderBy: { updatedAt: "desc" } });
  const nq = norm(q);
  const exact = all.find((p) => norm(p.title) === nq);
  if (exact) return { project: exact, candidates: [exact] };
  const qt = tokens(q);
  const scored = all.map((p) => {
    const pt = tokens(p.title);
    const ct = tokens(p.company || "");
    let s = 0;
    for (const t of qt) {
      if (pt.includes(t)) s += 3;
      else if (pt.some((n) => n.startsWith(t) || t.startsWith(n))) s += 1.5;
      if (ct.includes(t)) s += 2;
    }
    return { p, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  if (!scored.length) return { project: null, candidates: [] };
  const top = scored[0];
  if (top.s >= 3 && (scored.length === 1 || top.s - scored[1].s >= 1.5)) {
    return { project: top.p, candidates: scored.slice(0, 3).map((x) => x.p) };
  }
  return { project: null, candidates: scored.slice(0, 3).map((x) => x.p) };
}

export async function findProject(title?: string) {
  if (!title) return null;
  const { project } = await resolveProject(title);
  return project;
}

export async function toolCreateContact(args: any) {
  // DEDUPE: if same name (case-insensitive) or same email/phone exists, UPDATE instead of creating a duplicate.
  const nameQ = (args.name || "").trim();
  const { emails, phones } = normalizeContactFieldArgs(args);
  const firstEmail = emails[0]?.value;
  const firstPhone = phones[0]?.value;
  const hasExtras = emails.length > 0 || phones.length > 0;
  if (args.email) {
    const byEmail = await prisma.contact.findFirst({ where: { email: args.email } });
    if (byEmail) {
      const u = await prisma.contact.update({
        where: { id: byEmail.id },
        data: { name: nameQ || byEmail.name, phone: args.phone ?? byEmail.phone, company: args.company ?? byEmail.company, role: args.role ?? byEmail.role }
      });
      if (hasExtras) await applyContactExtras(byEmail.id, { emails, phones });
      return `Contact "${u.name}" already existed (matched email). UPDATED instead of duplicating (${u.id}).`;
    }
  }
  if (args.phone) {
    const byPhone = await prisma.contact.findFirst({ where: { phone: args.phone } });
    if (byPhone) {
      const u = await prisma.contact.update({
        where: { id: byPhone.id },
        data: { name: nameQ || byPhone.name, email: args.email ?? byPhone.email, company: args.company ?? byPhone.company, role: args.role ?? byPhone.role }
      });
      if (hasExtras) await applyContactExtras(byPhone.id, { emails, phones });
      return `Contact "${u.name}" already existed (matched phone). UPDATED instead of duplicating (${u.id}).`;
    }
  }
  if (nameQ) {
    const existing = await findContact(nameQ);
    if (existing && existing.name.toLowerCase() === nameQ.toLowerCase()) {
      const u = await prisma.contact.update({
        where: { id: existing.id },
        data: { email: args.email ?? existing.email, phone: args.phone ?? existing.phone, company: args.company ?? existing.company, role: args.role ?? existing.role }
      });
      if (hasExtras) await applyContactExtras(existing.id, { emails, phones });
      return `Contact "${u.name}" already existed. UPDATED ${u.id} instead of creating a duplicate.`;
    }
  }
  const c = await prisma.contact.create({
    data: { name: args.name, email: firstEmail ?? args.email ?? null, phone: firstPhone ?? args.phone ?? null, company: args.company, role: args.role, address: args.address }
  });
  if (hasExtras) await applyContactExtras(c.id, { emails, phones });
  return `CREATED contact ${c.name} (${c.id})`;
}

export async function toolSearchContacts(args: any) {
  const list = await searchContacts(args.query || "");
  return list.length ? list.map((c) => {
    // show ALL emails/phones so the AI knows every address it can reference
    const es = allEmails(c).join(", ") || "-";
    const ps = allPhones(c).join(", ") || "-";
    return `- ${c.name} | ${c.company || "-"} | emails: ${es} | phones: ${ps} [id:${c.id}]`;
  }).join("\n") : "No contacts found.";
}

export async function toolUpdateContact(args: any) {
  const list = await searchContacts(args.query || "");
  if (!list.length) return `No contact matches "${args.query}".`;
  if (list.length > 1 && !args.email && !args.phone && !args.emails && !args.phones) {
    return `Multiple match "${args.query}":\n` + list.map((c) => `- ${c.name} (emails: ${allEmails(c).join(", ") || "-"}) [id:${c.id}]`).join("\n") + `\nAsk user which one, or pass email/phone.`;
  }
  const target = list[0];
  const data: any = {};
  if (args.name) data.name = args.name;
  if (args.company !== undefined) data.company = args.company;
  if (args.role !== undefined) data.role = args.role;
  if (args.address !== undefined) data.address = args.address;
  const { emails, phones } = normalizeContactFieldArgs(args);
  const hasExtras = emails.length > 0 || phones.length > 0 || !!args.set_default_email || !!args.set_default_phone;
  // If the user passes a single email/phone AND it's the only one, replace the
  // default column (legacy behavior). If they use arrays, we ADD instead.
  const legacySingle = !args.emails && !args.phones;
  if (args.email !== undefined && legacySingle) data.email = args.email;
  if (args.phone !== undefined && legacySingle) data.phone = args.phone;
  const u = await prisma.contact.update({ where: { id: target.id }, data });
  if (hasExtras) {
    await applyContactExtras(target.id, {
      emails, phones,
      set_default_email: args.set_default_email,
      set_default_phone: args.set_default_phone
    });
  }
  const refreshed = await prisma.contact.findUnique({
    where: { id: u.id },
    include: {
      contactEmails: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      contactPhones: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }
    }
  });
  return `UPDATED ${u.name} (${u.id}). Now defaults ${refreshed?.email || "no email"} / ${refreshed?.phone || "no phone"}. All emails: ${allEmails(refreshed || {}).join(", ") || "none"}. All phones: ${allPhones(refreshed || {}).join(", ") || "none"}.`;
}

export async function toolDeleteContact(args: any) {
  const list = await searchContacts(args.query || "");
  if (!list.length) return `No contact matches "${args.query}" — nothing deleted.`;
  if (args.keep_one && list.length > 1) {
    const sorted = [...list].sort((a, b) => +a.createdAt - +b.createdAt);
    const [keep, ...rest] = sorted;
    await prisma.contact.deleteMany({ where: { id: { in: rest.map((c) => c.id) } } });
    return `DEDUPED: kept oldest "${keep.name}" (${keep.id}), deleted ${rest.length} duplicate(s).`;
  }
  if (list.length > 1) {
    return `REFUSED: ${list.length} contacts match "${args.query}" — too risky to delete all.\n` +
      list.map((c) => `- ${c.name} [id:${c.id}]`).join("\n") +
      `\nSay "dedupe <name>" (keep_one) or give an exact email/id.`;
  }
  await prisma.contact.delete({ where: { id: list[0].id } });
  return `DELETED ${list[0].name} (${list[0].id}).`;
}

export async function toolCreateProject(args: any) {
  // DEDUPE: if a project with the same title already exists, DON'T create a
  // duplicate — link the people to the existing one and report it back.
  const { project: existing, candidates } = await resolveProject(args.title);
  if (existing) {
    const linked: string[] = [];
    for (const n of args.contact_names || []) {
      const c = await findContact(n);
      if (c) {
        const dup = await prisma.projectContact.findUnique({
          where: { projectId_contactId: { projectId: existing.id, contactId: c.id } }
        }).catch(() => null);
        if (!dup) {
          await prisma.projectContact.create({ data: { projectId: existing.id, contactId: c.id } });
          linked.push(c.name);
        }
      }
    }
    return `Project "${existing.title}" already exists${existing.status ? ` [${existing.status}]` : ""} — NOT created again${linked.length ? `; linked: ${linked.join(", ")}` : ""}. If you wanted a NEW project, give it a distinct title.`;
  }
  if (candidates.length) {
    return `Ambiguous: ${candidates.length} projects look like "${args.title}": ${candidates.map((p) => `"${p.title}"`).join(" or ")}. Which one? Project NOT created — tell me which, or confirm a new title.`;
  }
  // Resolve + link people first, so POC can be validated against them.
  const linked: string[] = [];
  const linkedIds = new Set<string>();
  for (const n of args.contact_names || []) {
    const c = await findContact(n);
    if (c && !linkedIds.has(c.id)) {
      linkedIds.add(c.id);
      linked.push(c.name);
    }
  }
  let pocId: string | undefined;
  if (args.poc_name) {
    const poc = await findContact(args.poc_name);
    if (!poc) return `No person matches "${args.poc_name}" for Point of Contact — project NOT created. Add them first.`;
    if (!linkedIds.has(poc.id)) { linkedIds.add(poc.id); linked.push(poc.name); }
    pocId = poc.id;
  }
  const p = await prisma.project.create({
    data: {
      title: args.title,
      description: args.description,
      status: args.status && ["planned", "active", "complete", "abandoned"].includes(args.status) ? args.status : "planned",
      company: args.company,
      projectedRevenue: numOrNull(args.projected_revenue),
      revenue: numOrNull(args.revenue),
      expectedCompletion: dateOrNull(args.expected_completion),
      pocId,
    }
  });
  for (const cid of linkedIds) {
    await prisma.projectContact.create({ data: { projectId: p.id, contactId: cid } });
  }
  return `CREATED project "${p.title}" linked: ${linked.join(", ") || "none"}`;
}

export async function toolUpdateProject(args: any) {
  // Link existing tasks/notes/people to a project, or edit its fields.
  const { project, candidates } = await resolveProject(args.query || args.title);
  if (!project) {
    if (candidates.length) {
      return `Ambiguous: ${candidates.length} projects match "${args.query || args.title}": ${candidates.map((p) => `"${p.title}"`).join(" or ")}. Which one? Nothing changed.`;
    }
    return `No project matches "${args.query || args.title}". Nothing changed.`;
  }
  const data: any = {};
  if (args.new_title !== undefined) data.title = args.new_title;
  if (args.status !== undefined && ["planned", "active", "complete", "abandoned"].includes(args.status)) data.status = args.status;
  if (args.company !== undefined) data.company = args.company;
  if (args.description !== undefined) data.description = args.description;
  if (args.inception_date !== undefined) data.inceptionAt = dateOrNull(args.inception_date);
  if (args.next_deadline !== undefined) data.nextDeadline = dateOrNull(args.next_deadline);
  if (args.expected_completion !== undefined) data.expectedCompletion = dateOrNull(args.expected_completion);
  if (args.projected_revenue !== undefined) data.projectedRevenue = numOrNull(args.projected_revenue);
  if (args.revenue !== undefined) data.revenue = numOrNull(args.revenue);
  // Point of Contact must be a person linked to the project.
  if (args.poc_name !== undefined) {
    if (!args.poc_name) {
      data.pocId = null;
    } else {
      const poc = await findContact(args.poc_name);
      if (!poc) return `No person matches "${args.poc_name}" — POC not changed.`;
      const isLinked = await prisma.projectContact.findUnique({
        where: { projectId_contactId: { projectId: project.id, contactId: poc.id } }
      }).catch(() => null);
      if (!isLinked) return `"${poc.name}" isn't linked to "${project.title}" — link them first, then set them as POC.`;
      data.pocId = poc.id;
    }
  }
  const done: string[] = [];
  if (Object.keys(data).length) {
    await prisma.project.update({ where: { id: project.id }, data });
    done.push("updated fields");
  }
  // link a person
  if (args.contact_name) {
    const { contact, candidates: cc } = await resolveContact(args.contact_name);
    if (contact) {
      const dup = await prisma.projectContact.findUnique({
        where: { projectId_contactId: { projectId: project.id, contactId: contact.id } }
      }).catch(() => null);
      if (!dup) await prisma.projectContact.create({ data: { projectId: project.id, contactId: contact.id } });
      done.push(`linked ${contact.name}`);
    } else if (cc.length) {
      return `Ambiguous person "${args.contact_name}": ${cc.map((c: any) => `"${c.name}"`).join(" or ")}. Which one?`;
    }
  }
  // link a task by title/keyword
  if (args.task_query) {
    const list = await prisma.task.findMany({ take: 50, orderBy: { updatedAt: "desc" } });
    const lower = args.task_query.toLowerCase();
    const hits = list.filter((t) => t.title.toLowerCase().includes(lower) || lower.includes(t.title.toLowerCase().split(" ")[0]));
    if (!hits.length) return `No task matches "${args.task_query}" — nothing linked.`;
    if (hits.length > 1) {
      return `Ambiguous: ${hits.length} tasks match "${args.task_query}": ${hits.slice(0, 3).map((t) => `"${t.title}"`).join(" or ")}. Which one? Nothing linked.`;
    }
    await prisma.task.update({ where: { id: hits[0].id }, data: { projectId: project.id } });
    done.push(`linked task "${hits[0].title}"`);
  }
  // link a note by title/keyword
  if (args.note_query) {
    const list = await prisma.note.findMany({ take: 50, orderBy: { updatedAt: "desc" } });
    const lower = args.note_query.toLowerCase();
    const hits = list.filter((n) => (n.title || "").toLowerCase().includes(lower));
    if (!hits.length) return `No note matches "${args.note_query}" — nothing linked.`;
    if (hits.length > 1) {
      return `Ambiguous: ${hits.length} notes match "${args.note_query}": ${hits.slice(0, 3).map((n) => `"${n.title}"`).join(" or ")}. Which one? Nothing linked.`;
    }
    await prisma.note.update({ where: { id: hits[0].id }, data: { projectId: project.id } });
    done.push(`linked note "${hits[0].title}"`);
  }
  if (!done.length) return `Found project "${project.title}" but nothing to change. Specify a field, contact, task, or note to link.`;
  return `Project "${project.title}": ${done.join(", ")}.`;
}

export async function toolSearchProjects(args: any) {
  const list = await searchProjects(args.query || "");
  return list.length
    ? list.map((p) => `- "${p.title}" [${p.status}]${p.company ? ` @ ${p.company}` : ""} [id:${p.id}]`).join("\n")
    : "No projects found.";
}

export async function toolAddNote(args: any) {
  // Resolve person WITHOUT creating: ambiguous/no-match -> ask, never invent "George Bucor".
  let contactId: string | undefined;
  if (args.contact_name) {
    const { contact, candidates } = await resolveContact(args.contact_name);
    if (contact) contactId = contact.id;
    else if (candidates.length > 0) {
      return `Ambiguous person "${args.contact_name}". Did you mean ${candidates.map((c) => `"${c.name}"${c.company ? ` @ ${c.company}` : ""}`).join(" or ")}? Reply with the full name — note NOT saved yet.`;
    } else {
      return `No person matches "${args.contact_name}". Reply "create person ${args.contact_name}" to add them first, or give a different name — note NOT saved yet.`;
    }
  }
  let projectId: string | undefined;
  if (args.project_title) {
    const r = await resolveProject(args.project_title);
    if (r.project) projectId = r.project.id;
    else if (r.candidates.length > 0) {
      return `Ambiguous project "${args.project_title}". Did you mean ${r.candidates.map((p) => `"${p.title}"`).join(" or ")}? Note NOT saved yet — tell me which project.`;
    } else {
      return `No project matches "${args.project_title}" — note NOT saved yet. Say "create project ${args.project_title}" first if it's new.`;
    }
  }
  const title = args.title || args.body?.slice(0, 60) || "Untitled";
  const recent = await prisma.note.findMany({ orderBy: { createdAt: "desc" }, take: 3 });
  const now = Date.now();
  const dupe = recent.find((n) => n.body === (args.body || "") && n.title === title && now - +n.createdAt < 60000);
  if (dupe) return `Note added: "${dupe.title}" (already saved, skipped duplicate).`;
  const n = await prisma.note.create({
    data: { title, body: args.body || "", contactId, projectId, via: args.via || "chat" }
  });
  const who = contactId ? ` for ${(await prisma.contact.findUnique({ where: { id: contactId } }))?.name}` : "";
  return `Note added: "${n.title}"${who}`;
}

export async function toolUpdateNote(args: any) {
  const { note, candidates } = await resolveNote(args.query);
  if (!note) {
    if (candidates.length) return `Which note? ${candidates.map((n) => `"${n.title}"`).join(", ")}?`;
    return `No note matches "${args.query}".`;
  }
  const data: any = {};
  if (args.title !== undefined) data.title = args.title;
  if (args.body !== undefined) data.body = args.body;
  if (args.contact_name !== undefined) {
    if (args.contact_name) {
      const r = await resolveContact(args.contact_name);
      if (!r.contact) return `No person matches "${args.contact_name}" — note not updated.`;
      data.contactId = r.contact.id;
    } else data.contactId = null;
  }
  if (args.project_title !== undefined) {
    if (args.project_title) {
      const r = await resolveProject(args.project_title);
      if (r.project) data.projectId = r.project.id;
      else if (r.candidates.length > 0) {
        return `Ambiguous project "${args.project_title}". Did you mean ${r.candidates.map((p) => `"${p.title}"`).join(" or ")}? Note NOT updated — tell me which project.`;
      } else {
        return `No project matches "${args.project_title}" — note not updated. Say "create project ${args.project_title}" first if it's new.`;
      }
    } else data.projectId = null;
  }
  const u = await prisma.note.update({ where: { id: note.id }, data });
  return `Note updated: "${u.title}"`;
}

export async function toolSummarizeFile(args: any) {
  const docs = await prisma.document.findMany({
    where: { OR: [{ filename: { contains: args.doc_query } }, { id: args.doc_query }] }, take: 3
  });
  if (!docs.length) return `No file matches "${args.doc_query}".`;
  const d = docs[0];
  if (!d.text || d.text.length < 20) return `"${d.filename}" has no readable text to summarize.`;
  const { getOpenAI, SMART_MODEL } = await import("./openai");
  const openai = await getOpenAI();
  const s = await openai.chat.completions.create({
    model: SMART_MODEL,
    messages: [
      { role: "system", content: "Summarize this document for a CRM: who, what, key dates, commitments, next steps. Keep under 150 words." },
      { role: "user", content: d.text.slice(0, 12000) }
    ]
  });
  const summary = s.choices[0].message.content || "";
  await prisma.document.update({ where: { id: d.id }, data: { summary } });
  return `Summary of "${d.filename}":\n${summary}`;
}

export async function toolLinkEvent(args: any) {
  const q = (args.event_query || "").trim();
  if (!q) return `Missing event_query — tell me which meeting to link (event title or keyword). Nothing linked.`;
  if (!args.contact_name && !args.project_title) {
    return `Tell me who to link the meeting to — a person (contact_name) or a project (project_title). Nothing linked.`;
  }
  // Resolve the target person (no auto-create, same convention as notes).
  let contactId: string | undefined;
  let contactLabel = "";
  if (args.contact_name) {
    const { contact, candidates } = await resolveContact(args.contact_name);
    if (contact) { contactId = contact.id; contactLabel = contact.name; }
    else if (candidates.length > 0) {
      return `Ambiguous person "${args.contact_name}". Did you mean ${candidates.map((c: any) => `"${c.name}"`).join(" or ")}? Nothing linked yet.`;
    } else {
      return `No person matches "${args.contact_name}" — nothing linked. Say "create person ${args.contact_name}" first if they're new.`;
    }
  }
  // Resolve the target project.
  let projectId: string | undefined;
  let projectLabel = "";
  if (args.project_title) {
    const r = await resolveProject(args.project_title);
    if (r.project) { projectId = r.project.id; projectLabel = r.project.title; }
    else if (r.candidates.length > 0) {
      return `Ambiguous project "${args.project_title}". Did you mean ${r.candidates.map((p: any) => `"${p.title}"`).join(" or ")}? Nothing linked yet.`;
    } else {
      return `No project matches "${args.project_title}" — nothing linked. Say "create project ${args.project_title}" first if it's new.`;
    }
  }
  // Find the calendar event by title/UID (title match, any time window).
  const { findTitanEventByUid } = await import("./titan");
  const found = await findTitanEventByUid(q).catch(() => null);
  if (!found) return `No calendar event matches "${q}" — nothing linked. Try list_items(kind="meetings") to see exact event titles.`;
  const ev = found.event;
  const accountEmail = await activeAccountEmail();
  const link = await prisma.eventLink.upsert({
    where: { accountEmail_eventUid_contactId_projectId: { accountEmail, eventUid: ev.uid, contactId: contactId || "", projectId: projectId || "" } },
    update: { eventTitle: ev.summary || "", eventStart: ev.start ? ev.start.toISOString() : "", eventEnd: ev.end ? ev.end.toISOString() : "" },
    create: {
      eventUid: ev.uid,
      accountEmail,
      eventTitle: ev.summary || "",
      eventStart: ev.start ? ev.start.toISOString() : "",
      eventEnd: ev.end ? ev.end.toISOString() : "",
      contactId, projectId,
    },
  });
  void link;
  const to = [contactLabel ? `person "${contactLabel}"` : "", projectLabel ? `project "${projectLabel}"` : ""].filter(Boolean).join(" and ");
  return `Event "${ev.summary || q}" linked to ${to}. It now shows up under their Events section. Titan itself was not changed.`;
}

export async function toolLinkDoc(args: any) {
  const docs = await prisma.document.findMany({
    where: { OR: [{ filename: { contains: args.doc_query } }, { id: args.doc_query }] }, take: 3
  });
  if (!docs.length) return "No matching document.";
  const contact = await findContact(args.contact_name);
  const project = await findProject(args.project_title);
  await prisma.document.update({ where: { id: docs[0].id }, data: { contactId: contact?.id, projectId: project?.id } });
  return `LINKED ${docs[0].filename}`;
}
