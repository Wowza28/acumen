import { prisma } from "./db";
import { embedTexts, cosine } from "./rag";

/**
 * Lenient date parser for agent tool args. Handles "today"/"tomorrow"/ISO
 * strings; rejects template junk ("[insert...]"). Stale past years are bumped
 * to the current year to counter model hallucinations. Returns undefined
 * (never throws) so tools can report "couldn't read the date" cleanly.
 */
export function parseDateInput(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s || /\[insert/i.test(s)) return undefined;
  const now = new Date();
  const lower = s.toLowerCase();
  // "today" / "tomorrow" / "day after tomorrow"
  const day = new Date(now);
  day.setHours(9, 0, 0, 0);
  if (lower === "today") return day;
  if (lower === "tomorrow") { day.setDate(day.getDate() + 1); return day; }
  if (lower.includes("day after tomorrow")) { day.setDate(day.getDate() + 2); return day; }
  const d = new Date(s);
  if (isNaN(+d)) return undefined;
  // fix stale-year hallucinations: if year < current year, bump to current year
  if (d.getFullYear() < now.getFullYear()) {
    d.setFullYear(now.getFullYear());
    if (+d < +now - 86400000) {
      // still in the past (e.g. "Jan 5" after June) → assume next year? keep current year, agent will confirm
    }
  }
  return d;
}

export function fmtDate(d?: Date | string | null): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(+dt)) return "";
  return dt.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export async function toolCreateTask(args: any) {
  const { resolveContact } = await import("./crm");
  let contactId: string | undefined;
  if (args.contact_name) {
    const r = await resolveContact(args.contact_name);
    if (r.contact) contactId = r.contact.id;
    else if (r.candidates.length > 0) {
      return `Ambiguous person "${args.contact_name}". Did you mean ${r.candidates.map((c: any) => `"${c.name}"`).join(" or ")}? Task NOT created yet.`;
    }
    // no match + no candidates: leave unlinked, don't invent a person
  }
  let projectId: string | undefined;
  if (args.project_title) {
    const { resolveProject } = await import("./crm");
    const r = await resolveProject(args.project_title);
    if (r.project) projectId = r.project.id;
    else if (r.candidates.length > 0) {
      return `Ambiguous project "${args.project_title}". Did you mean ${r.candidates.map((p: any) => `"${p.title}"`).join(" or ")}? Task NOT created yet — tell me which project.`;
    }
  }
  const due = parseDateInput(args.due_at);
  const status = ["todo", "in-progress", "done"].includes(args.status) ? args.status : "todo";
  const priority = ["low", "medium", "high"].includes(args.priority) ? args.priority : "medium";
  const t = await prisma.task.create({
    data: {
      title: args.title,
      description: args.description || "",
      status, priority,
      dueAt: due,
      contactId, projectId
    }
  });
  return `Task created: "${t.title}"${due ? ` due ${fmtDate(due)}` : ""}`;
}

export async function toolUpdateTask(args: any) {
  const { resolveTask } = await import("./crm");
  const history: string = args._history || "";
  const { task, candidates } = await resolveTask(args.query, history);
  if (!task) {
    if (candidates.length) return `Which task? ${candidates.map((t: any) => `"${t.title}"`).join(", ")}?`;
    return `No task matches "${args.query}". Tell me the task title — nothing was changed.`;
  }
  const data: any = {};
  if (args.title !== undefined) data.title = args.title;
  if (args.description !== undefined) data.description = args.description;
  if (args.status !== undefined && ["todo", "in-progress", "done"].includes(args.status)) data.status = args.status;
  if (args.priority !== undefined && ["low", "medium", "high"].includes(args.priority)) data.priority = args.priority;
  if (args.due_at !== undefined) data.dueAt = parseDateInput(args.due_at);
  if (args.contact_name !== undefined) {
    if (args.contact_name) {
      const { resolveContact } = await import("./crm");
      const r = await resolveContact(args.contact_name);
      if (r.contact) data.contactId = r.contact.id;
    } else data.contactId = null;
  }
  if (args.project_title !== undefined) {
    if (args.project_title) {
      const { resolveProject } = await import("./crm");
      const r = await resolveProject(args.project_title);
      if (r.project) data.projectId = r.project.id;
      else if (r.candidates.length > 0) {
        return `Ambiguous project "${args.project_title}". Did you mean ${r.candidates.map((p: any) => `"${p.title}"`).join(" or ")}? Task NOT updated yet — tell me which project.`;
      } else {
        return `No project matches "${args.project_title}" — task NOT updated. Say "create project ${args.project_title}" first if it's new, or give the exact title.`;
      }
    } else data.projectId = null;
  }
  const u = await prisma.task.update({ where: { id: task.id }, data });
  return `Task updated: "${u.title}"${data.dueAt ? ` due ${fmtDate(data.dueAt)}` : ""}${data.projectId ? " and linked to project" : ""}`;
}

export async function toolCompleteTask(args: any) {
  const list = await prisma.task.findMany({ where: { title: { contains: args.query || "" } }, take: 5 });
  if (!list.length) return `No task matches "${args.query}".`;
  await prisma.task.updateMany({ where: { id: { in: list.map((t) => t.id) } }, data: { status: "done" } });
  return `Task completed: ${list.map((t) => `"${t.title}"`).join(", ")}`;
}

export async function toolGetNote(args: any) {
  const q = (args.query || "").trim().toLowerCase();
  let contactId: string | undefined;
  if (args.contact_name) {
    const { resolveContact } = await import("./crm");
    const r = await resolveContact(args.contact_name);
    if (r.contact) contactId = r.contact.id;
  }
  const where: any = {};
  if (contactId) where.contactId = contactId;
  if (args.project_title) {
    const { findProject } = await import("./crm");
    const p = await findProject(args.project_title);
    if (p) where.projectId = p.id;
  }
  const all = await prisma.note.findMany({ where, orderBy: { createdAt: "desc" }, take: 50, include: { contact: true, project: true } });
  if (!all.length) return "No notes found.";
  if (q === "latest" || q === "newest" || q === "recent" || q === "last note" || q === "my latest note") {
    const n = all[0];
    return `[NOTE] title="${n.title}" person=${n.contact?.name || "-"} project=${n.project?.title || "-"} created=${n.createdAt.toISOString()}\n${n.body}`;
  }
  // exact title match first
  const exact = all.find((n) => (n.title || "").toLowerCase() === q);
  if (exact) return `[NOTE] title="${exact.title}" person=${exact.contact?.name || "-"} project=${exact.project?.title || "-"} created=${exact.createdAt.toISOString()}\n${exact.body}`;
  const keys: string[] = q.split(/[^a-z0-9]+/).filter((w: string) => w.length > 2);
  const hits = all.filter((n) =>
    keys.some((k: string) => (n.title || "").toLowerCase().includes(k) || (n.body || "").toLowerCase().includes(k)));
  if (!hits.length) return `No note matches "${args.query}". Available: ${all.slice(0, 5).map((n) => `"${n.title}"`).join(", ")}.`;
  return hits.slice(0, 3).map((n) =>
    `[NOTE] title="${n.title}" person=${n.contact?.name || "-"} project=${n.project?.title || "-"} created=${n.createdAt.toISOString()}\n${n.body}`).join("\n\n");
}

export async function toolGetTask(args: any) {
  const q = (args.query || "").trim().toLowerCase();
  const where: any = {};
  if (args.contact_name) {
    const { resolveContact } = await import("./crm");
    const r = await resolveContact(args.contact_name);
    if (r.contact) where.contactId = r.contact.id;
  }
  const all = await prisma.task.findMany({ where, orderBy: { updatedAt: "desc" }, take: 50, include: { contact: true, project: true } });
  if (!all.length) return "No tasks found.";
  if (["latest", "newest", "recent", "last"].includes(q)) {
    const t = all[0];
    return `[TASK] "${t.title}" status=${t.status} priority=${t.priority} due=${t.dueAt || "-"} person=${t.contact?.name || "-"}\n${t.description || "(no description)"}`;
  }
  if (q === "all open" || q === "open" || q === "open tasks") {
    const open = all.filter((t) => t.status !== "done");
    if (!open.length) return "No open tasks.";
    return open.map((t) => `[TASK] "${t.title}" status=${t.status} priority=${t.priority} due=${t.dueAt || "-"}`).join("\n");
  }
  const keys: string[] = q.split(/[^a-z0-9]+/).filter((w: string) => w.length > 2);
  const hits = all.filter((t) => keys.some((k: string) => t.title.toLowerCase().includes(k) || (t.description || "").toLowerCase().includes(k)));
  if (!hits.length) return `No task matches "${args.query}".`;
  return hits.slice(0, 3).map((t) =>
    `[TASK] "${t.title}" status=${t.status} priority=${t.priority} due=${t.dueAt || "-"} person=${t.contact?.name || "-"}\n${t.description || "(no description)"}`).join("\n\n");
}

export async function toolListItems(args: any) {
  // emails default higher: users expect their inbox, not a 10-item sample
  const emails = args.kind === "emails";
  const limit = Math.min(args.limit || (emails ? 50 : 10), emails ? 200 : 30);
  const where: any = {};
  if (args.contact_name) {
    const { resolveContact } = await import("./crm");
    const r = await resolveContact(args.contact_name);
    if (r.contact) where.contactId = r.contact.id;
  }
  if (args.project_title) {
    const { findProject } = await import("./crm");
    const p = await findProject(args.project_title);
    if (p) where.projectId = p.id;
  }
  if (args.kind === "notes") {
    const list = await prisma.note.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, include: { contact: true } });
    if (!list.length) return "No notes.";
    return list.map((n, i) => `${i + 1}. "${n.title}" (${n.contact?.name || "no person"}, ${new Date(n.createdAt).toLocaleDateString()})`).join("\n");
  }
  if (args.kind === "tasks") {
    const list = await prisma.task.findMany({ where, orderBy: { updatedAt: "desc" }, take: limit, include: { contact: true } });
    if (!list.length) return "No tasks.";
    return list.map((t, i) => `${i + 1}. "${t.title}" [${t.status}/${t.priority}]${t.dueAt ? ` due ${new Date(t.dueAt).toLocaleDateString()}` : ""}`).join("\n");
  }
  if (args.kind === "projects") {
    const list = await prisma.project.findMany({ orderBy: { updatedAt: "desc" }, take: limit, include: { contacts: { include: { contact: true } } } });
    if (!list.length) return "No projects.";
    return list.map((p, i) => `${i + 1}. "${p.title}" [${p.status}] — ${p.contacts.map((c: any) => c.contact.name).join(", ") || "no people"}`).join("\n");
  }
  if (args.kind === "emails") {
    // No Titan account configured → the assistant must not reference any mail.
    const { getTitanAccount } = await import("./titanAccount");
    if (!(await getTitanAccount())) {
      return "No Titan account is configured, so there is no mail to read. Add one in Settings → Accounts first.";
    }
    const list = await prisma.syncedEmail.findMany({ orderBy: { date: "desc" }, take: limit });
    if (!list.length) return "No synced emails yet. Ask the user to press 'Mail' in the sidebar to sync their Titan inbox first.";
    return list.map((e, i) => `${i + 1}. [${new Date(e.date || e.createdAt).toLocaleString()}] ${e.subject || "(no subject)"} — from ${e.from || "?"} :: ${(e.body || e.snippet || "").slice(0, 300)}`).join("\n");
  }
  if (args.kind === "meetings") {
    const { fetchTitanEvents } = await import("./titan");
    // window around now so "this week" / "upcoming" / "recent" are all covered
    const from = new Date(Date.now() - 14 * 86400000);
    const to = new Date(Date.now() + 90 * 86400000);
    const list = await fetchTitanEvents(from, to).catch(() => [] as any[]);
    if (!list.length) return "No calendar events found in the Titan calendar for the surrounding weeks. If you just added one, press 'Cal' in the sidebar to refresh — and note the event must be on a calendar synced to Titan CalDAV.";
    return list.slice(0, limit).map((m: any, i: number) =>
      `${i + 1}. "${m.summary || "(no title)"}" — ${fmtDate(m.start)}${m.end ? ` to ${fmtDate(m.end)}` : ""}${m.allDay ? " (all-day)" : ""}${m.location ? ` @ ${m.location}` : ""}`
    ).join("\n");
  }
  return "Unknown kind.";
}

export async function toolAskKb(args: any) {
  const q = (args.query as string || "").trim();
  if (!q) return "Empty query.";
  const words: string[] = q.toLowerCase().split(/[^a-z0-9]+/).filter((w: string) => w.length > 2);
  const stop = new Set(["what", "when", "where", "which", "whom", "whose", "that", "this", "with", "from", "about", "there", "their", "have", "does", "did", "are", "for", "the", "and", "note", "notes", "task", "tasks", "latest", "newest", "recent", "find", "show", "tell", "give", "list"]);
  const keys: string[] = words.filter((w: string) => !stop.has(w));
  const like = (v: string) => ({ contains: v });

  // resolve person/project scope if given (fuzzy, no creation)
  let contactId: string | undefined;
  if (args.contact_name) {
    const { resolveContact } = await import("./crm");
    const r = await resolveContact(args.contact_name);
    if (r.contact) contactId = r.contact.id;
  }
  let projectId: string | undefined;
  if (args.project_title) {
    const { findProject } = await import("./crm");
    const p = await findProject(args.project_title);
    if (p) projectId = p.id;
  }

  // 1) NOTES: title match first, then content match on any keyword, newest first
  let notes: any[] = [];
  if (keys.length) {
    const ors: any[] = [];
    for (const k of keys.slice(0, 6)) ors.push({ title: like(k) }, { body: like(k) });
    notes = await prisma.note.findMany({
      where: { AND: [{ OR: ors }, ...(contactId ? [{ contactId }] : []), ...(projectId ? [{ projectId }] : [])] },
      take: 10, orderBy: { createdAt: "desc" },
      include: { contact: true, project: true }
    });
  } else {
    notes = await prisma.note.findMany({
      where: { ...(contactId ? { contactId } : {}), ...(projectId ? { projectId } : {}) },
      take: 5, orderBy: { createdAt: "desc" },
      include: { contact: true, project: true }
    });
  }

  // 2) TASKS: title/description keyword match
  let tasks: any[] = [];
  if (keys.length) {
    const ors: any[] = [];
    for (const k of keys.slice(0, 6)) ors.push({ title: like(k) }, { description: like(k) });
    tasks = await prisma.task.findMany({
      where: { AND: [{ OR: ors }, ...(contactId ? [{ contactId }] : []), ...(projectId ? [{ projectId }] : [])] },
      take: 10, orderBy: { updatedAt: "desc" },
      include: { contact: true, project: true }
    });
  }

  // 3) PROJECTS: title/description keyword match
  let projects: any[] = [];
  if (keys.length) {
    const ors: any[] = [];
    for (const k of keys.slice(0, 6)) ors.push({ title: like(k) }, { description: like(k) });
    projects = await prisma.project.findMany({
      where: { OR: ors }, take: 5, orderBy: { updatedAt: "desc" },
      include: { contacts: { include: { contact: true } } }
    });
  }

  // 4) DOC chunks (semantic, as before)
  const [qEmb] = await embedTexts([q]);
  const chunks = await prisma.docChunk.findMany({ take: 300, include: { document: true } });
  const scored = chunks.map((c) => {
    try {
      const e = JSON.parse(c.embedding || "[]");
      return { c, s: Array.isArray(e) && e.length ? cosine(qEmb, e) : 0 };
    } catch { return { c, s: 0 }; }
  }).sort((a, b) => b.s - a.s).slice(0, Math.min(args.top_k || 4, 8));

  // Emails are only referenced when a Titan account is configured.
  const { getTitanAccount } = await import("./titanAccount");
  const mailAccount = await getTitanAccount();
  const emails = mailAccount
    ? await prisma.syncedEmail.findMany({
        where: keys.length
          ? { OR: keys.slice(0, 4).flatMap((k) => [{ subject: like(k) }, { snippet: like(k) }, { body: like(k) }, { from: like(k) }]) }
          : {},
        take: 5
      })
    : [];

  // 5) CALENDAR (Titan): events whose title/description match the query
  const { fetchTitanEvents } = await import("./titan");
  const calFrom = new Date(Date.now() - 30 * 86400000);
  const calTo = new Date(Date.now() + 120 * 86400000);
  const allEvents = await fetchTitanEvents(calFrom, calTo).catch(() => [] as any[]);
  const events = keys.length
    ? allEvents.filter((e: any) => {
        const hay = `${e.summary || ""} ${e.description || ""} ${e.location || ""}`.toLowerCase();
        return keys.some((k) => hay.includes(k));
      })
    : allEvents;

  const lines: string[] = [];
  lines.push(`(Today is ${new Date().toDateString()}. "Latest" = highest createdAt below.)`);
  notes.forEach((n, i) =>
    lines.push(`[NOTE ${i + 1}] title="${n.title}" person=${n.contact?.name || "-"} project=${n.project?.title || "-"} created=${n.createdAt.toISOString()} :: ${(n.body || "").slice(0, 600)}`));
  tasks.forEach((t, i) =>
    lines.push(`[TASK ${i + 1}] "${t.title}" status=${t.status} priority=${t.priority} person=${t.contact?.name || "-"} project=${t.project?.title || "-"} due=${t.dueAt || "-"} :: ${(t.description || "").slice(0, 400)}`));
  projects.forEach((p, i) =>
    lines.push(`[PROJECT ${i + 1}] "${p.title}" status=${p.status} people=${p.contacts.map((c: any) => c.contact.name).join(", ")} :: ${(p.description || "").slice(0, 400)}`));
  scored.forEach((x, i) => lines.push(`[DOC ${i + 1} ${x.c.document.filename}] ${x.c.text.slice(0, 500)}`));
  emails.forEach((e) => lines.push(`[EMAIL ${e.subject}] ${(e.snippet || "").slice(0, 400)}`));
  events.slice(0, 8).forEach((e: any) => lines.push(`[CALENDAR EVENT] "${e.summary || "(no title)"}" ${fmtDate(e.start)}${e.end ? `–${fmtDate(e.end)}` : ""}${e.location ? ` @ ${e.location}` : ""} :: ${(e.description || "").slice(0, 300)}`));
  if (lines.length === 1) return "No matching notes, tasks, projects, docs, emails, or calendar events found.";
  return lines.join("\n\n");
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function toolDraftEmail(args: any, historyText = "") {
  const { draftTitanEmail, resolveAttachmentFiles } = await import("./titan");
  // 1) resolve recipient: direct email, else look up in People
  let to = (args.to || "").trim();
  if (!to || !EMAIL_RE.test(to)) {
    const { resolveContact } = await import("./crm");
    const r = await resolveContact(args.to || args.contact_name || "");
    if (r.contact?.email) to = r.contact.email;
    else if (r.candidates.length) {
      return `Which person did you mean: ${r.candidates.map((c: any) => `"${c.name}"`).join(" or ")}? Draft NOT saved — give me the exact recipient.`;
    } else {
      return `No email on file for "${args.to || args.contact_name}". Draft NOT saved — add their email to People first, or give me the address directly.`;
    }
  }
  // 2) subject + body: use what the AI composed, else draft from the overview
  let subject = (args.subject || "").trim();
  let body = (args.body || "").trim();
  if (!subject || !body) {
    const about = (args.about || args.instructions || "").trim();
    if (!about) return "Give me either a subject+body, or a short 'about' overview to draft from. Nothing saved.";
    try {
      const { getOpenAI, CHAT_MODEL } = await import("./openai");
      const openai = await getOpenAI();
      const r = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: "You write concise, professional emails. Reply with EXACTLY two lines: first line 'Subject: <subject>', then a blank line, then the email body. Plain text only, no HTML. No sign-off or signature — the user adds it manually." },
          { role: "user", content: `Write an email to ${to}. About: ${about}` }
        ]
      } as any);
      const text = (r.choices?.[0] as any)?.message?.content || "";
      const m = text.match(/Subject:\s*(.+)/i);
      subject = subject || (m ? m[1].trim() : about.slice(0, 60));
      body = body || text.replace(/^Subject:.*\r?\n?/i, "").trim() || about;
    } catch (e: any) {
      return `Couldn't draft the email text (${e.message}). Provide subject+body directly, or try a different model.`;
    }
  }
  // 3) attachments: explicit `attachments` arg + any "[Attached files: ...]" names
  // from this turn's chat history (chat-uploaded files are uploaded first, then
  // named in the user message suffix — e.g. "attach this to the email").
  const names: string[] = [];
  const pushName = (n: any) => {
    const s = String(n || "").trim();
    if (s && !names.some((x) => x.toLowerCase() === s.toLowerCase())) names.push(s);
  };
  if (Array.isArray(args.attachments)) args.attachments.forEach(pushName);
  else if (typeof args.attachments === "string" && args.attachments.trim()) pushName(args.attachments);
  // Chat-uploaded files: page.tsx appends an "[Attached files: a, b. Uploaded; ...]"
  // suffix to the user message — parse it with the shared helper so the trailing
  // instruction text is stripped and only real filenames are picked up.
  try {
    const { splitAttachments } = await import("./attach");
    for (const u of String(historyText || "").split("\n")) {
      const { files } = splitAttachments(u);
      files.forEach(pushName);
    }
  } catch { /* attach helper unavailable — explicit names only */ }
  const resolved = names.length ? await resolveAttachmentFiles(names, undefined) : [];
  // resolver returns one entry per matched QUERY (fuzzy) — anything unmatched is missing
  const missing = names.filter((n) => !resolved.some((r) => r.query.toLowerCase() === n.toLowerCase()));
  // 4) save to Titan Drafts (never sends)
  const { folder } = await draftTitanEmail({ to, subject, body, attachments: resolved.map((r) => ({ name: r.name })) });
  const attNote = resolved.length ? ` Attached ${resolved.length} file${resolved.length > 1 ? "s" : ""}: ${resolved.map((r) => r.name).join(", ")}.` : "";
  const missNote = missing.length ? ` (Could not find: ${missing.join(", ")} — attach it in chat or check Files first.)` : "";
  return `Draft saved to your Titan "${folder}" folder — To: ${to}, Subject: "${subject}".${attNote} Open Titan Mail to review and send it. (Nothing was sent.)${missNote}`;
}

/** Create an event on the user's Titan calendar (CalDAV PUT). Times as ISO. */
export async function toolCreateEvent(args: any) {
  const { createTitanEvent } = await import("./titan");
  const summary = (args.summary || args.title || "").trim();
  if (!summary) return "Missing event summary — nothing created.";
  const start = parseDateInput(args.start);
  if (!start) return `Couldn't read the start time "${args.start || ""}" — use an ISO datetime like 2026-03-05T15:00:00. Nothing created.`;
  let end = args.end ? parseDateInput(args.end) : undefined;
  if (args.end && !end) return `Couldn't read the end time "${args.end}" — use an ISO datetime. Nothing created.`;
  if (!end) end = args.all_day ? new Date(start.getTime() + 86400000) : new Date(start.getTime() + 3600000);
  try {
    const { uid } = await createTitanEvent({
      summary,
      start,
      end,
      allDay: !!args.all_day,
      location: args.location ? String(args.location) : undefined,
      description: args.description ? String(args.description) : undefined,
      meetingLink: args.meeting_link ? String(args.meeting_link) : undefined,
      guests: Array.isArray(args.guests) ? args.guests : []
    });
    return `Event created: "${summary}" — ${fmtDate(start)}${args.all_day ? " (all day)" : ` to ${fmtDate(end)}`}${args.location ? ` @ ${args.location}` : ""}${Array.isArray(args.guests) && args.guests.length ? ` with ${args.guests.join(", ")}` : ""}. UID ${uid}.`;
  } catch (e: any) {
    return `Failed to create the event on Titan CalDAV: ${e.message}. Nothing was created.`;
  }
}

/** Edit an existing Titan calendar event (matched by UID or title). Pass ONLY fields to change. */
export async function toolUpdateEvent(args: any) {
  const { updateTitanEvent, findTitanEventByUid } = await import("./titan");
  const q = (args.query || "").trim();
  if (!q) return "Missing `query` (the event's title or identifier) — nothing updated.";
  const existing = await findTitanEventByUid(q).catch(() => null);
  if (!existing) return `No Titan calendar event matches "${q}" — nothing updated. Try list_items(kind="meetings") to see the exact event titles.`;
  const patch: any = {};
  if (args.summary !== undefined) patch.summary = String(args.summary);
  if (args.start !== undefined) {
    const s = parseDateInput(args.start);
    if (!s) return `Couldn't read the new start "${args.start}" — use an ISO datetime. Nothing updated.`;
    patch.start = s;
  }
  if (args.end !== undefined) {
    const e = parseDateInput(args.end);
    if (!e) return `Couldn't read the new end "${args.end}" — use an ISO datetime. Nothing updated.`;
    patch.end = e;
  }
  if (args.all_day !== undefined) patch.allDay = !!args.all_day;
  if (args.location !== undefined) patch.location = String(args.location);
  if (args.description !== undefined) patch.description = String(args.description);
  if (args.meeting_link !== undefined) patch.meetingLink = String(args.meeting_link);
  if (Array.isArray(args.guests)) { patch.guests = args.guests; patch.replaceGuests = !!args.replace_guests; }
  if (!Object.keys(patch).length) return `No fields to change for "${existing.event.summary || q}" — pass summary/start/end/location/description/meeting_link/guests.`;
  try {
    await updateTitanEvent(existing.event.uid, patch);
    return `Event updated: "${patch.summary || existing.event.summary}" (${existing.event.uid}) — changed: ${Object.keys(patch).filter((k) => k !== "replaceGuests").join(", ")}.`;
  } catch (e: any) {
    return `Failed to update the event on Titan CalDAV: ${e.message}. Nothing was changed.`;
  }
}

