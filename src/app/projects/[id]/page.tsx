"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import { IconBack, IconTask, IconNote, IconPeople, IconFile, IconTrash, IconPencil, IconMeeting, IconAccounts } from "@/components/icons";
import { STATUS_STYLE, PRIORITY_STYLE, Tag, fmtDue, PROJECT_STATUS, PROJECT_STATUS_LABEL, ProjectStatusTag, fmtAED } from "@/components/TaskBits";
import { kindOf, fmtSize } from "@/components/FileBits";
import TaskEditor from "@/components/TaskEditor";
import NoteEditor from "@/components/NoteEditor";
import FileViewer from "@/components/FileViewer";
import ProjectLogo from "@/components/ProjectLogo";
import EventDrawer, { type Ev } from "@/components/EventDrawer";
import LinkedTransactionsTable, { type LinkedTx } from "@/components/LinkedTransactions";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(+dt) ? "—" : dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtEvDate(e: Ev): string {
  if (!e.start) return "—";
  const d = new Date(e.start);
  if (isNaN(+d)) return "—";
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return e.allDay ? date : `${date} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="font-medium truncate">{value || <i className="text-slate-400">—</i>}</div>
    </div>
  );
}

// For <input type="date"> values (YYYY-MM-DD) from an ISO/Date string.
function toDateInput(d?: string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(+dt)) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function Section({ icon, title, count, children }: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="card mb-4">
      <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
        {icon} {title} <span className="text-slate-400 font-normal text-sm">({count})</span>
      </h2>
      {children}
    </div>
  );
}

const Empty = ({ what }: { what: string }) => <div className="text-sm text-slate-400">No {what} linked.</div>;

function ProjectDetailInner() {
  const params = useParams();
  const id = (Array.isArray(params?.id) ? params.id[0] : params?.id) as string | undefined;
  const router = useRouter();
  const [p, setP] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [viewFileId, setViewFileId] = useState<string | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [viewEvent, setViewEvent] = useState<Ev | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [transactions, setTransactions] = useState<LinkedTx[]>([]);
  const [allContacts, setAllContacts] = useState<any[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);

  async function load() {
    if (!id) return;
    const j = await fetch(`/api/projects?id=${id}`).then((r) => r.json()).catch(() => null);
    if (j && !j.error) { setP(j); setNotFound(false); }
    else setNotFound(true);
    fetch(`/api/event-links?projectId=${id}`).then((r) => r.json()).then((ej: any) => {
      if (Array.isArray(ej?.events)) setEvents(ej.events);
    }).catch(() => {});
    // Transactions DIRECTLY linked to this project (never via people).
    fetch(`/api/transaction-links?projectId=${id}`).then((r) => r.json()).then((tj: any) => {
      if (Array.isArray(tj?.transactions)) {
        setTransactions(tj.transactions.map((t: any) => ({
          id: t.id, description: t.description, amount: t.amount,
          currency: t.currency, transactionDate: t.transactionDate,
        })));
      } else setTransactions([]);
    }).catch(() => {});
    fetch("/api/contacts").then((r) => r.json()).then((cj: any) => {
      if (Array.isArray(cj)) setAllContacts(cj);
    }).catch(() => {});
    // Keep Revenue live: recompute from linked transactions on every open,
    // then reflect the fresh value in the displayed project.
    fetch("/api/transaction-links/sync-revenue", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: id }),
    }).then((r) => r.json()).then((rj: any) => {
      if (rj && !rj.error && Number.isFinite(Number(rj.revenue))) {
        setP((prev: any) => prev ? { ...prev, revenue: Number(rj.revenue) } : prev);
      }
    }).catch(() => {});
  }
  useEffect(() => { load(); }, [id]);

  async function linkPerson(contactId: string) {
    if (!contactId || linkBusy || !id) return;
    setLinkBusy(true);
    try {
      await fetch("/api/project-contacts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, contactId }),
      });
      load();
    } finally { setLinkBusy(false); }
  }
  async function unlinkPerson(contactId: string) {
    if (linkBusy || !id) return;
    setLinkBusy(true);
    try {
      await fetch(`/api/project-contacts?projectId=${encodeURIComponent(id)}&contactId=${encodeURIComponent(contactId)}`, { method: "DELETE" });
      load();
    } finally { setLinkBusy(false); }
  }

  async function del() {
    if (!p) return;
    if (!confirm(`Delete project "${p.title}"? This cannot be undone. Tasks, notes, and files will be unlinked but kept.`)) return;
    await fetch(`/api/projects?id=${p.id}`, { method: "DELETE" });
    router.push("/projects");
  }

  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");

  function startEditDesc() {
    setDescDraft(p?.description || "");
    setEditingDesc(true);
  }

  async function saveDesc() {
    if (!p) return;
    const res = await fetch(`/api/projects?id=${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: descDraft })
    });
    if (res.ok) {
      const updated = await res.json().catch(() => null);
      setEditingDesc(false);
      if (updated && !updated.error) {
        // Re-fetch full detail so tasks/notes/documents/meetings stay populated.
        const full = await fetch(`/api/projects?id=${p.id}`).then((r) => r.json()).catch(() => null);
        if (full && !full.error) setP(full);
        else setP((prev: any) => ({ ...prev, description: updated.description }));
      }
    }
  }

  const back = (
    <div className="flex items-center justify-between mb-3">
      <button className="btn-ghost text-sm flex items-center gap-1" onClick={() => router.push("/projects")}>
        <IconBack /> Back
      </button>
      {p && (
        <button className="icon-btn !text-red-500" onClick={del} title="Delete project">
          <IconTrash />
        </button>
      )}
    </div>
  );

  if (notFound) return (
    <Shell>{back}<div className="card text-sm text-slate-500">Project not found.</div></Shell>
  );
  if (!p) return <Shell><div className="card text-sm text-slate-500">Loading…</div></Shell>;

  const tasks: any[] = p.tasks || [];
  const notes: any[] = p.notes || [];
  const files: any[] = p.documents || [];
  const people: any[] = (p.contacts || []).map((c: any) => c.contact).filter(Boolean);

  // Next Deadline default: due date of the soonest linked task that isn't done.
  const soonestTaskDue = tasks
    .filter((t: any) => t.dueAt && t.status !== "done")
    .map((t: any) => new Date(t.dueAt).getTime())
    .sort((a: number, b: number) => a - b)[0];
  const defaultDeadline = soonestTaskDue ? new Date(soonestTaskDue).toISOString() : null;
  // Inception default: the project's own creation date unless overridden.
  const inceptionShown = p.inceptionAt || p.createdAt;

  function startEdit() {
    setForm({
      title: p.title || "",
      description: p.description || "",
      company: p.company || "",
      status: p.status || "planned",
      inceptionAt: toDateInput(p.inceptionAt || p.createdAt),
      nextDeadline: toDateInput(p.nextDeadline || defaultDeadline),
      pocId: p.pocId || "",
      projectedRevenue: p.projectedRevenue ?? "",
      revenue: p.revenue ?? "",
      expectedCompletion: toDateInput(p.expectedCompletion),
    });
    setEditing(true);
  }

  async function saveEdit() {
    const body: any = {
      title: (form.title || "").trim() || p.title,
      description: form.description,
      company: form.company,
      status: form.status,
      inceptionAt: form.inceptionAt || null,
      nextDeadline: form.nextDeadline || null,
      pocId: form.pocId || null,
      projectedRevenue: form.projectedRevenue === "" ? null : Number(form.projectedRevenue),
      revenue: form.revenue === "" ? null : Number(form.revenue),
      expectedCompletion: form.expectedCompletion || null,
    };
    await fetch(`/api/projects?id=${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setEditing(false);
    load();
  }

  return (
    <Shell>
      {back}
      <div className="card mb-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <ProjectLogo projectId={p.id} logoUrl={p.logo ? `/api/projects/logo?id=${p.id}` : null} onUploaded={load} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              {editing ? (
                <input
                  className="input text-xl font-semibold"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Project name"
                />
              ) : (
                <>
                  <h1 className="text-xl font-semibold truncate">{p.title}</h1>
                  <button onClick={startEdit} title="Edit project details"
                    className="icon-btn !p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200">
                    <IconPencil className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
            {editing ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <label className="text-sm flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Company</span>
                  <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company" />
                </label>
                <label className="text-sm flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Status</span>
                  <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {PROJECT_STATUS.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
                  </select>
                </label>
                <label className="text-sm flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Inception Date</span>
                  <input type="date" className="input" value={form.inceptionAt} onChange={(e) => setForm({ ...form, inceptionAt: e.target.value })} />
                </label>
                <label className="text-sm flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Next Deadline</span>
                  <input type="date" className="input" value={form.nextDeadline} onChange={(e) => setForm({ ...form, nextDeadline: e.target.value })} />
                </label>
                <label className="text-sm flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Point of Contact</span>
                  <select className="input" value={form.pocId} onChange={(e) => setForm({ ...form, pocId: e.target.value })}>
                    <option value="">— none —</option>
                    {people.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="text-sm flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Projected Revenue (AED)</span>
                  <input type="number" className="input" value={form.projectedRevenue} onChange={(e) => setForm({ ...form, projectedRevenue: e.target.value })} placeholder="0" />
                </label>
                <label className="text-sm flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Revenue (AED)</span>
                  <input type="number" className="input" value={form.revenue} onChange={(e) => setForm({ ...form, revenue: e.target.value })} placeholder="0" />
                </label>
                <label className="text-sm flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Expected Completion</span>
                  <input type="date" className="input" value={form.expectedCompletion} onChange={(e) => setForm({ ...form, expectedCompletion: e.target.value })} />
                </label>
                <label className="text-sm flex flex-col gap-1 col-span-2 md:col-span-3">
                  <span className="text-xs text-slate-500">Description</span>
                  <textarea
                    rows={4}
                    className="input"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Add a description…"
                  />
                </label>
                <div className="col-span-2 md:col-span-3 flex gap-2 mt-1">
                  <button className="btn !py-1.5" onClick={saveEdit}>Save</button>
                  <button className="btn-ghost !py-1.5" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Company" value={p.company} />
                <div>
                  <div className="text-xs text-slate-400">Status</div>
                  <div className="mt-0.5"><ProjectStatusTag status={p.status} /></div>
                </div>
                <Field label="Inception Date" value={fmtDate(inceptionShown)} />
                <Field label="Next Deadline" value={fmtDate(p.nextDeadline || defaultDeadline)} />
                <Field label="Point of Contact" value={p.poc?.name} />
                <Field label="Projected Revenue" value={fmtAED(p.projectedRevenue)} />
                <Field label="Revenue" value={fmtAED(p.revenue)} />
                <Field label="Expected Completion" value={fmtDate(p.expectedCompletion)} />
              </div>
            )}
            {!editing && (
            <div className="mt-3 group">
              <div className="flex items-center gap-1.5">
                <div className="text-xs text-slate-400">Description</div>
                {!editingDesc && (
                  <button
                    onClick={startEditDesc}
                    title="Edit description"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                  >
                    <IconPencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {editingDesc ? (
                <div className="mt-1">
                  <textarea
                    autoFocus
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    rows={4}
                    className="w-full text-sm rounded border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 outline-none focus:border-slate-500"
                    placeholder="Add a description…"
                    onKeyDown={(e) => { if (e.key === "Escape") setEditingDesc(false); }}
                  />
                  <div className="flex gap-2 mt-1.5">
                    <button onClick={saveDesc} className="btn-primary text-xs px-3 py-1">Save</button>
                    <button onClick={() => setEditingDesc(false)} className="btn-ghost text-xs px-3 py-1">Cancel</button>
                  </div>
                </div>
              ) : (
                <p onClick={startEditDesc} className="text-sm text-slate-500 mt-1 whitespace-pre-wrap cursor-pointer hover:text-slate-600 dark:hover:text-zinc-300">
                  {p.description || "No description."}
                </p>
              )}
            </div>
            )}
          </div>
        </div>
      </div>
      <Section icon={<IconTask />} title="Tasks" count={tasks.length}>
        {tasks.length ? (
          <div className="card !p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200 dark:border-zinc-800">
                <th className="px-4 py-2 font-medium">Title</th><th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Priority</th><th className="px-4 py-2 font-medium">Due</th>
              </tr></thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} onClick={() => setEditTaskId(t.id)} className="table-row cursor-pointer">
                    <td className="px-4 py-2 font-medium">{t.title}</td>
                    <td className="px-4 py-2"><Tag v={t.status} map={STATUS_STYLE} /></td>
                    <td className="px-4 py-2"><Tag v={t.priority} map={PRIORITY_STYLE} /></td>
                    <td className="px-4 py-2 text-slate-500 dark:text-zinc-400">{fmtDue(t.dueAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty what="tasks" />}
      </Section>

      <Section icon={<IconNote />} title="Notes" count={notes.length}>
        {notes.length ? (
          <div className="card !p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200 dark:border-zinc-800">
                <th className="px-4 py-2 font-medium">Name</th><th className="px-4 py-2 font-medium">Date</th>
              </tr></thead>
              <tbody>
                {notes.map((n: any) => (
                  <tr key={n.id} onClick={() => setEditNoteId(n.id)} className="table-row cursor-pointer">
                    <td className="px-4 py-2">
                      <div className="font-medium">{n.title || "Untitled"}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[52ch]">{(n.body || "").slice(0, 120)}</div>
                    </td>
                    <td className="px-4 py-2 text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                      {new Date(n.updatedAt || n.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty what="notes" />}
      </Section>
      <Section icon={<IconMeeting />} title="Events" count={events.length}>
        {events.length ? (
          <div className="card !p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200 dark:border-zinc-800">
                <th className="px-4 py-2 font-medium">Meeting</th><th className="px-4 py-2 font-medium">When</th>
              </tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.uid} onClick={() => setViewEvent(e)} className="table-row cursor-pointer">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <IconMeeting className="shrink-0 text-slate-400" />
                        <span className="font-medium truncate">{e.summary || "(no title)"}</span>
                        {e.auto && <span className="text-[10px] uppercase tracking-wide text-brand-500 shrink-0">auto</span>}
                      </div>
                      {e.location && <div className="text-xs text-slate-400 truncate max-w-[52ch]">{e.location}</div>}
                    </td>
                    <td className="px-4 py-2 text-slate-500 dark:text-zinc-400 whitespace-nowrap">{fmtEvDate(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty what="meetings" />}
      </Section>

      <Section icon={<IconPeople />} title="People" count={people.length}>
        <select className="input !w-auto !py-1.5 text-xs mb-3" value="" disabled={linkBusy}
          title="Link a person to this project"
          onChange={(e) => { const v = e.target.value; e.target.value = ""; linkPerson(v); }}>
          <option value="">＋ Add a Person…</option>
          {allContacts.filter((c: any) => !people.some((m: any) => m.id === c.id)).map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {people.length ? (
          <div className="card !p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200 dark:border-zinc-800">
                <th className="px-4 py-2 font-medium">Name</th><th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Phone</th><th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Role</th><th className="w-10"></th>
              </tr></thead>
              <tbody>
                {people.map((c: any) => (
                  <tr key={c.id} onClick={() => router.push(`/people?person=${c.id}&from=/projects/${p.id}`)} className="table-row cursor-pointer">
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2 text-slate-500 dark:text-zinc-400">{c.email || "—"}</td>
                    <td className="px-4 py-2 text-slate-500 dark:text-zinc-400">{c.phone || "—"}</td>
                    <td className="px-4 py-2 text-slate-500 dark:text-zinc-400">{c.company || "—"}</td>
                    <td className="px-4 py-2 text-slate-500 dark:text-zinc-400">{c.role || "—"}</td>
                    <td className="px-2 py-2 text-right">
                      <button type="button" title="Unlink from this project" disabled={linkBusy}
                        onClick={(e) => { e.stopPropagation(); unlinkPerson(c.id); }}
                        className="icon-btn !p-1 text-slate-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty what="people" />}
      </Section>

      <Section icon={<IconAccounts />} title="Transactions" count={transactions.length}>
        <LinkedTransactionsTable transactions={transactions} />
      </Section>

      <Section icon={<IconFile />} title="Files" count={files.length}>
        {files.length ? (
          <div className="card !p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200 dark:border-zinc-800">
                <th className="px-4 py-2 font-medium">Name</th><th className="px-4 py-2 font-medium">Date</th>
              </tr></thead>
              <tbody>
                {files.map((d: any) => (
                  <tr key={d.id} onClick={() => setViewFileId(d.id)} className="table-row cursor-pointer">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <IconFile className="shrink-0" />
                        <span className="font-medium truncate">{d.filename}</span>
                      </div>
                      <div className="text-xs text-slate-400">{kindOf(d.mime, d.filename)} · {fmtSize(d.size)}</div>
                    </td>
                    <td className="px-4 py-2 text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                      {new Date(d.updatedAt || d.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty what="files" />}
      </Section>

      {editTaskId && <TaskEditor id={editTaskId} onClose={() => setEditTaskId(null)} onSaved={() => { setEditTaskId(null); load(); }} onDeleted={() => { setEditTaskId(null); load(); }} />}
      {editNoteId && <NoteEditor id={editNoteId} onClose={() => setEditNoteId(null)} onSaved={() => { setEditNoteId(null); load(); }} onDeleted={() => { setEditNoteId(null); load(); }} />}
      {viewFileId && <FileViewer id={viewFileId} onClose={() => setViewFileId(null)} onDeleted={() => { setViewFileId(null); load(); }} onRelinked={() => { load(); }} />}
      {viewEvent && <EventDrawer ev={viewEvent} onClose={() => setViewEvent(null)} onChanged={load} />}
    </Shell>
  );
}

export default function ProjectDetailPage() {
  return (
    <Suspense fallback={<Shell><div className="card text-sm text-slate-500 animate-pulse">Loading…</div></Shell>}>
      <ProjectDetailInner />
    </Suspense>
  );
}
