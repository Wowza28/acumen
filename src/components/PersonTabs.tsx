"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconFile, IconMeeting } from "@/components/icons";
import { kindOf, fmtSize } from "@/components/FileBits";
import { STATUS_STYLE, PRIORITY_STYLE, Tag, fmtDue, ProjectStatusTag } from "@/components/TaskBits";
import TaskEditor from "@/components/TaskEditor";
import NoteEditor from "@/components/NoteEditor";
import FileViewer from "@/components/FileViewer";
import EventDrawer, { type Ev } from "@/components/EventDrawer";
import LinkedTransactionsTable, { type LinkedTx } from "@/components/LinkedTransactions";
import TransactionDrawer from "@/components/TransactionDrawer";

const TABS = ["Projects", "Tasks", "Notes", "Files", "Events", "Transactions"] as const;

function fmtEvDate(e: Ev): string {
  if (!e.start) return "";
  const d = new Date(e.start);
  if (isNaN(+d)) return "";
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return e.allDay ? date : `${date} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export default function PersonTabs({ id, onChanged, onTransactionClick }: { id: string; onChanged?: () => void; onTransactionClick?: (t: LinkedTx) => void; }) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Projects");
  const [notes, setNotes] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const [files, setFiles] = useState<any[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [transactions, setTransactions] = useState<LinkedTx[]>([]);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // On tab click, scroll the tabs card to the top of the viewport so the
  // tab bar stays pinned while browsing (mobile-only).
  const selectTab = useCallback((t: "Projects" | "Tasks" | "Notes" | "Files" | "Events" | "Transactions") => {
    setTab(t);
    if (window.innerWidth < 768) {
      requestAnimationFrame(() => {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);
  const [viewEvent, setViewEvent] = useState<Ev | null>(null);
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [viewFileId, setViewFileId] = useState<string | null>(null);

  function load() {
    fetch("/api/notes").then((r) => r.json()).then((all: any[]) => {
      if (Array.isArray(all)) setNotes(all.filter((n) => n.contactId === id));
    }).catch(() => {});
    fetch("/api/tasks").then((r) => r.json()).then((all: any[]) => {
      if (Array.isArray(all)) setTasks(all.filter((t) => t.contactId === id));
    }).catch(() => {});
    fetch("/api/projects").then((r) => r.json()).then((all: any[]) => {
      if (Array.isArray(all)) {
        setAllProjects(all);
        setProjects(all.filter((p) => (p.contacts || []).some((c: any) => c.contactId === id || c.contact?.id === id)));
      }
    }).catch(() => {});
    fetch("/api/files").then((r) => r.json()).then((all: any[]) => {
      if (Array.isArray(all)) setFiles(all.filter((d) => d.contactId === id));
    }).catch(() => {});
    fetch(`/api/event-links?contactId=${id}`).then((r) => r.json()).then((j: any) => {
      if (Array.isArray(j?.events)) setEvents(j.events);
    }).catch(() => {});
    fetch(`/api/transaction-links?contactId=${id}`).then((r) => r.json()).then((j: any) => {
      if (Array.isArray(j?.transactions)) {
        setAllTransactions(j.transactions);
        setTransactions(j.transactions.map((t: any) => ({
          id: t.id, description: t.description, amount: t.amount,
          currency: t.currency, transactionDate: t.transactionDate,
        })));
      } else {
        setAllTransactions([]);
        setTransactions([]);
      }
    }).catch(() => {});
  }
  function handleTransactionClick(t: LinkedTx) {
    const full = allTransactions.find((tx) => tx.id === t.id) || null;
    setSelectedTransaction(full);
  }

  useEffect(() => { load(); }, [id]);

  async function linkProject(projectId: string) {
    if (!projectId || linkBusy) return;
    setLinkBusy(true);
    try {
      await fetch("/api/project-contacts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, contactId: id }),
      });
      load();
    } finally { setLinkBusy(false); }
  }
  async function unlinkProject(projectId: string) {
    if (linkBusy) return;
    setLinkBusy(true);
    try {
      await fetch(`/api/project-contacts?projectId=${encodeURIComponent(projectId)}&contactId=${encodeURIComponent(id)}`, { method: "DELETE" });
      load();
    } finally { setLinkBusy(false); }
  }

  return (
    <div ref={cardRef} className="card flex-1 min-w-0 w-full">
      <div className="grid grid-cols-2 gap-1 mb-3 md:flex md:gap-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => selectTab(t)} className={`tab-btn text-center ${tab === t ? "tab-btn-active" : ""}`}>{t}</button>
        ))}
      </div>
      <div className="text-sm flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
        {tab === "Projects" && (
          <div className="flex flex-col gap-2">
            <select className="input !w-auto !py-1.5 text-xs self-start" value="" disabled={linkBusy}
              title="Link this person to a project"
              onChange={(e) => { const v = e.target.value; e.target.value = ""; linkProject(v); }}>
              <option value="">＋ Add to a Project…</option>
              {allProjects.filter((ap) => !projects.some((m) => m.id === ap.id)).map((ap) => (
                <option key={ap.id} value={ap.id}>{ap.title}</option>
              ))}
            </select>
            {projects.length === 0 && <span className="text-slate-400">No projects linked.</span>}
            {/* Mobile: stacked cards */}
            {projects.length > 0 && (
              <div className="flex flex-col gap-2 md:hidden">
                {projects.map((p: any) => (
                  <div key={p.id} onClick={() => router.push(`/projects/${p.id}`)} className="card !p-3 cursor-pointer">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-semibold leading-snug">{p.title}</span>
                      <ProjectStatusTag status={p.status} />
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {new Date(p.inceptionAt || p.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                    {(p.description || "") && <div className="text-slate-500 dark:text-zinc-400 mt-1 line-clamp-3">{p.description}</div>}
                  </div>
                ))}
              </div>
            )}
            {/* Desktop: table */}
            {projects.length > 0 && (
              <div className="hidden md:block card !p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200 dark:border-zinc-800">
                    <th className="px-4 py-2 font-medium">Name</th><th className="px-4 py-2 font-medium">Date</th><th className="w-10"></th>
                  </tr></thead>
                  <tbody>
                    {projects.map((p: any) => (
                      <tr key={p.id} onClick={() => router.push(`/projects/${p.id}`)} className="table-row cursor-pointer">
                        <td className="px-4 py-2">
                          <div className="font-medium flex items-center gap-2">{p.title} <ProjectStatusTag status={p.status} /></div>
                          {(p.description || "") && <div className="text-xs text-slate-400 truncate max-w-[46ch]">{p.description.slice(0, 140)}</div>}
                        </td>
                        <td className="px-4 py-2 text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                          {new Date(p.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button type="button" title="Unlink from this person" disabled={linkBusy}
                            onClick={(e) => { e.stopPropagation(); unlinkProject(p.id); }}
                            className="icon-btn !p-1 text-slate-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
            {tab === "Tasks" && (
              <>
                {tasks.length === 0 && <span className="text-slate-400">No tasks linked.</span>}
                {tasks.length > 0 && (
                  <div className="flex flex-col gap-2 md:hidden">
                    {tasks.map((t) => (
                      <div key={t.id} onClick={() => setEditTaskId(t.id)} className="card !p-3 cursor-pointer">
                        <div className="font-medium">{t.title}</div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <Tag v={t.status} map={STATUS_STYLE} />
                          <Tag v={t.priority} map={PRIORITY_STYLE} />
                        </div>
                        <div className="text-xs text-slate-400 mt-1">{fmtDue(t.dueAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {tasks.length > 0 && (
                  <div className="hidden md:block card !p-0 overflow-x-auto">
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
                )}
              </>
            )}
                    {tab === "Notes" && (
              <>
                {notes.length === 0 && <span className="text-slate-400">No notes linked.</span>}
                {notes.length > 0 && (
                  <div className="flex flex-col gap-2 md:hidden">
                    {notes.map((n: any) => (
                      <div key={n.id} onClick={() => setEditNoteId(n.id)} className="card !p-3 cursor-pointer">
                        <div className="font-medium">{n.title || "Untitled"}</div>
                        {(n.body || "") && <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">{(n.body || "").slice(0, 140)}</div>}
                        <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                          {new Date(n.updatedAt || n.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {notes.length > 0 && (
                  <div className="hidden md:block card !p-0 overflow-x-auto">
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
                )}
              </>
            )}
            {tab === "Files" && (
              <>
                {files.length === 0 && <span className="text-slate-400">No files linked.</span>}
                {files.length > 0 && (
                  <div className="flex flex-col gap-2 md:hidden">
                    {files.map((d: any) => (
                      <div key={d.id} onClick={() => setViewFileId(d.id)} className="card !p-3 cursor-pointer">
                        <div className="flex items-center gap-2 flex-wrap">
                          <IconFile className="shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium break-words">{d.filename}</div>
                            <div className="text-xs text-slate-400">{kindOf(d.mime, d.filename)} · {fmtSize(d.size)}</div>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                          {new Date(d.updatedAt || d.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {files.length > 0 && (
                  <div className="hidden md:block card !p-0 overflow-x-auto">
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
                )}
              </>
            )}
            {tab === "Events" && (
              <>
                {events.length === 0 && <span className="text-slate-400">No meetings linked.</span>}
                {events.length > 0 && (
                  <div className="flex flex-col gap-2 md:hidden">
                    {events.map((e) => (
                      <div key={e.uid} onClick={() => setViewEvent(e)} className="card !p-3 cursor-pointer">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium flex items-center gap-2">
                            {e.summary || "(no title)"}
                            {e.auto && <span className="text-[10px] uppercase tracking-wide text-brand-500">auto</span>}
                          </div>
                          <span className="text-xs text-slate-500 dark:text-zinc-400 whitespace-nowrap">{fmtEvDate(e)}</span>
                        </div>
                        {e.location && <div className="text-xs text-slate-400 mt-1">{e.location}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {events.length > 0 && (
                  <div className="hidden md:block card !p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200 dark:border-zinc-800">
                        <th className="px-4 py-2 font-medium">Events</th><th className="px-4 py-2 font-medium">When</th>
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
                )}
              </>
            )}
        {tab === "Transactions" && <LinkedTransactionsTable transactions={transactions} onTransactionClick={handleTransactionClick} />}
      </div>

      {viewEvent && <EventDrawer ev={viewEvent} onClose={() => setViewEvent(null)} onChanged={load} />}

      {editTaskId && <TaskEditor id={editTaskId} onClose={() => setEditTaskId(null)} onSaved={() => { setEditTaskId(null); load(); onChanged?.(); }} onDeleted={() => { setEditTaskId(null); load(); onChanged?.(); }} />}
      {editNoteId && <NoteEditor id={editNoteId} onClose={() => setEditNoteId(null)} onSaved={() => { setEditNoteId(null); load(); onChanged?.(); }} onDeleted={() => { setEditNoteId(null); load(); onChanged?.(); }} />}
      {viewFileId && <FileViewer id={viewFileId} onClose={() => setViewFileId(null)} onDeleted={() => { setViewFileId(null); load(); onChanged?.(); }} onRelinked={() => { load(); onChanged?.(); }} />}
      {selectedTransaction && (
        <TransactionDrawer key={selectedTransaction.id} transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} />
      )}
    </div>
  );
}

