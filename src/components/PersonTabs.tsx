"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconFile, IconMeeting } from "@/components/icons";
import { kindOf, fmtSize } from "@/components/FileBits";
import { STATUS_STYLE, PRIORITY_STYLE, Tag, fmtDue } from "@/components/TaskBits";
import TaskEditor from "@/components/TaskEditor";
import NoteEditor from "@/components/NoteEditor";
import FileViewer from "@/components/FileViewer";
import EventDrawer, { type Ev } from "@/components/EventDrawer";
import LinkedTransactionsTable, { type LinkedTx } from "@/components/LinkedTransactions";

const TABS = ["Projects", "Tasks", "Notes", "Files", "Events", "Transactions"] as const;

function fmtEvDate(e: Ev): string {
  if (!e.start) return "";
  const d = new Date(e.start);
  if (isNaN(+d)) return "";
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return e.allDay ? date : `${date} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export default function PersonTabs({ id, onChanged }: { id: string; onChanged?: () => void }) {
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
        setTransactions(j.transactions.map((t: any) => ({
          id: t.id, description: t.description, amount: t.amount,
          currency: t.currency, transactionDate: t.transactionDate,
        })));
      } else setTransactions([]);
    }).catch(() => {});
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
    <div className="card flex-1 min-w-0">
      <div className="flex gap-1 mb-3">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`tab-btn ${tab === t ? "tab-btn-active" : ""}`}>{t}</button>
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
            {projects.length ? (
              <div className="card !p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200 dark:border-zinc-800">
                    <th className="px-4 py-2 font-medium">Name</th><th className="px-4 py-2 font-medium">Date</th><th className="w-10"></th>
                  </tr></thead>
                  <tbody>
                    {projects.map((p: any) => (
                      <tr key={p.id} onClick={() => router.push(`/projects/${p.id}`)} className="table-row cursor-pointer">
                        <td className="px-4 py-2">
                          <div className="font-medium">{p.title} <span className="text-xs text-slate-400">[{p.status}]</span></div>
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
            ) : <span className="text-slate-400">No projects linked.</span>}
          </div>
        )}
        {tab === "Tasks" && (tasks.length ? (
          <div className="card !p-0 overflow-hidden">
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
        ) : <span className="text-slate-400">No tasks linked.</span>)}
        {tab === "Notes" && (notes.length ? (
          <div className="card !p-0 overflow-hidden">
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
        ) : <span className="text-slate-400">No notes linked.</span>)}
        {tab === "Files" && (files.length ? (
          <div className="card !p-0 overflow-hidden">
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
        ) : <span className="text-slate-400">No files linked.</span>)}
        {tab === "Events" && (events.length ? (
          <div className="card !p-0 overflow-hidden">
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
        ) : <span className="text-slate-400">No meetings linked.</span>)}
        {tab === "Transactions" && <LinkedTransactionsTable transactions={transactions} />}
      </div>

      {viewEvent && <EventDrawer ev={viewEvent} onClose={() => setViewEvent(null)} onChanged={load} />}

      {editTaskId && <TaskEditor id={editTaskId} onClose={() => setEditTaskId(null)} onSaved={() => { setEditTaskId(null); load(); onChanged?.(); }} onDeleted={() => { setEditTaskId(null); load(); onChanged?.(); }} />}
      {editNoteId && <NoteEditor id={editNoteId} onClose={() => setEditNoteId(null)} onSaved={() => { setEditNoteId(null); load(); onChanged?.(); }} onDeleted={() => { setEditNoteId(null); load(); onChanged?.(); }} />}
      {viewFileId && <FileViewer id={viewFileId} onClose={() => setViewFileId(null)} onDeleted={() => { setViewFileId(null); load(); onChanged?.(); }} onRelinked={() => { load(); onChanged?.(); }} />}
    </div>
  );
}

