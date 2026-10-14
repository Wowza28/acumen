"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import PageHeader from "@/components/PageHeader";
import { IconPeople, IconProject } from "@/components/icons";
import NoteEditor from "@/components/NoteEditor";

export default function NotesPage() {
  const [list, setList] = useState<any[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");

  async function load() {
    const n = await fetch("/api/notes").then((r) => r.json()).catch(() => []);
    setList(Array.isArray(n) ? n : []);
  }
  useEffect(() => { load(); }, []);

  const filtered = list.filter((n) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (n.title || "").toLowerCase().includes(s) || (n.body || "").toLowerCase().includes(s)
      || (n.contact?.name || "").toLowerCase().includes(s) || (n.project?.title || "").toLowerCase().includes(s);
  });

  return (
    <Shell wide>
      <PageHeader icon="notes" title="Notes" count={filtered.length} right={
        <div className="flex items-center gap-2">
          <input className="input !w-56" placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn !py-1.5 flex items-center gap-1.5" onClick={() => setAdding(true)}><span className="text-base leading-none">+</span> Add</button>
        </div>
      } />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((n) => (
          <button key={n.id} onClick={() => setSelId(n.id)} className="card text-left hover:shadow-md hover:border-brand-500/50 dark:hover:border-brand-400/50 transition-all">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="text-xs text-slate-400 flex items-center gap-1.5 min-w-0">
                {n.contact && <span className="flex items-center gap-1 truncate"><IconPeople className="shrink-0" />{n.contact.name}</span>}
                {n.project && <span className="flex items-center gap-1 truncate"><IconProject className="shrink-0" />{n.project.title}</span>}
                {!n.contact && !n.project && <span>—</span>}
              </div>
              <span className="text-[11px] text-slate-400 shrink-0">
                {new Date(n.updatedAt || n.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </div>
            <div className="font-semibold text-base leading-snug mb-1">{n.title || "Untitled"}</div>
            <div className="text-sm text-slate-500 dark:text-zinc-400 line-clamp-3">{(n.body || "").slice(0, 220)}</div>
          </button>
        ))}
      </div>
      {!filtered.length && <div className="card text-sm text-slate-500 mt-3">{list.length ? "No notes match your search." : "No notes yet — create one."}</div>}

      {selId && <NoteEditor id={selId} onClose={() => setSelId(null)} onSaved={() => { setSelId(null); load(); }} onDeleted={() => { setSelId(null); load(); }} />}
      {adding && <NoteEditor id={null} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </Shell>
  );
}
