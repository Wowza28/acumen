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
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const [peopleList, setPeopleList] = useState<Array<{ id: string; name: string }>>([]);
  const [projectsList, setProjectsList] = useState<Array<{ id: string; title: string }>>([]);

  async function load() {
    const n = await fetch("/api/notes").then((r) => r.json()).catch(() => []);
    setList(Array.isArray(n) ? n : []);
  }
  useEffect(() => {
    load();
    fetch("/api/contacts").then((r) => r.json()).then((j) => { if (Array.isArray(j)) setPeopleList(j); }).catch(() => {});
    fetch("/api/projects").then((r) => r.json()).then((j) => { if (Array.isArray(j)) setProjectsList(j); }).catch(() => {});
  }, []);

  const filtered = list.filter((n) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (n.title || "").toLowerCase().includes(s) || (n.body || "").toLowerCase().includes(s)
      || (n.contact?.name || "").toLowerCase().includes(s) || (n.project?.title || "").toLowerCase().includes(s);
  });

  // Selection mode: once any card is checked, clicking anywhere on another
  // card toggles its selection instead of opening the note editor.
  const selectionMode = checkedIds.size > 0;

  function toggleChecked(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    if (filtered.length > 0 && filtered.every((n) => checkedIds.has(n.id))) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(filtered.map((n) => n.id)));
    }
  }
  function onCardClick(id: string) {
    if (selectionMode) toggleChecked(id);
    else setSelId(id);
  }

  function runBulk(action: () => Promise<{ count: number; note?: string }>) {
    if (bulkBusy) return;
    setBulkBusy(true); setBulkMsg("");
    action()
      .then(({ count, note }) => {
        setBulkMsg(note || `Done for ${count} note${count === 1 ? "" : "s"}.`);
        load();
      })
      .catch((e: any) => setBulkMsg(e?.message || "Bulk action failed."))
      .finally(() => setBulkBusy(false));
  }
  function bulkLink(field: "contactId" | "projectId", id: string) {
    if (!id || !checkedIds.size) return;
    const ids = [...checkedIds];
    runBulk(async () => {
      const r = await fetch("/api/notes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, [field]: id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not link notes.");
      return { count: typeof j.updated === "number" ? j.updated : ids.length };
    });
  }
  function bulkDelete() {
    const ids = [...checkedIds];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected note${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    runBulk(async () => {
      const r = await fetch("/api/notes", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not delete notes.");
      setCheckedIds(new Set());
      const n = typeof j.deleted === "number" ? j.deleted : ids.length;
      return { count: n, note: `Deleted ${n} note${n === 1 ? "" : "s"}.` };
    });
  }

  return (
    <Shell wide>
      <PageHeader icon="notes" title="Notes" count={filtered.length} right={
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1">
            <input type="checkbox" checked={filtered.length > 0 && filtered.every((n) => checkedIds.has(n.id))}
              onChange={toggleSelectAll} className="cbx" title="Select all shown notes" aria-label="Select all shown notes" />
            <span className="text-[10px] text-slate-500 dark:text-zinc-400 whitespace-nowrap">Select All</span>
          </span>
          <input className="input !w-56" placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} />
          {selectionMode ? (
            <>
              <span className="text-xs text-slate-500 dark:text-zinc-400 whitespace-nowrap">{checkedIds.size} selected</span>
              <select className="input !w-auto !h-7 !py-0 text-xs" value="" disabled={bulkBusy} title="Link selected notes to a person"
                onChange={(e) => { const v = e.target.value; e.target.value = ""; bulkLink("contactId", v); }}>
                <option value="">Link Person…</option>
                {peopleList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="input !w-auto !h-7 !py-0 text-xs" value="" disabled={bulkBusy} title="Link selected notes to a project"
                onChange={(e) => { const v = e.target.value; e.target.value = ""; bulkLink("projectId", v); }}>
                <option value="">Link Project…</option>
                {projectsList.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <button className="btn !h-7 !py-0 px-3 text-xs !bg-red-600 hover:!bg-red-700 !text-white" disabled={bulkBusy} onClick={bulkDelete} title="Delete selected notes">
                {bulkBusy ? "Working…" : "Delete"}
              </button>
              <button className="btn-ghost text-xs" disabled={bulkBusy} onClick={() => { setCheckedIds(new Set()); setBulkMsg(""); }} title="Clear selection">✕ Clear</button>
            </>
          ) : (
            <button className="btn !py-1.5 flex items-center gap-1.5" onClick={() => setAdding(true)}><span className="text-base leading-none">+</span> Add</button>
          )}
        </div>
      } />
      {!!bulkMsg && <div className="text-xs text-slate-500 dark:text-zinc-400 mb-2">{bulkMsg}</div>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((n) => {
          const checked = checkedIds.has(n.id);
          return (
            <div key={n.id} role="button" tabIndex={0} onClick={() => onCardClick(n.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCardClick(n.id); } }}
              className={`card text-left cursor-pointer hover:shadow-md hover:border-brand-500/50 dark:hover:border-brand-400/50 transition-all ${checked ? "!border-brand-500 ring-2 ring-brand-500/30" : ""}`}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="text-xs text-slate-400 flex items-center gap-1.5 min-w-0">
                  {n.contact && <span className="flex items-center gap-1 truncate"><IconPeople className="shrink-0" />{n.contact.name}</span>}
                  {n.project && <span className="flex items-center gap-1 truncate"><IconProject className="shrink-0" />{n.project.title}</span>}
                  {!n.contact && !n.project && <span>—</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-slate-400">
                    {new Date(n.updatedAt || n.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  <input type="checkbox" checked={checked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleChecked(n.id)}
                    className="cbx" title={checked ? "Deselect note" : "Select note"} aria-label={`Select ${n.title || "note"}`} />
                </div>
              </div>
              <div className="font-semibold text-base leading-snug mb-1">{n.title || "Untitled"}</div>
              <div className="text-sm text-slate-500 dark:text-zinc-400 line-clamp-3">{(n.body || "").slice(0, 220)}</div>
            </div>
          );
        })}
      </div>
      {!filtered.length && <div className="card text-sm text-slate-500 mt-3">{list.length ? "No notes match your search." : "No notes yet — create one."}</div>}

      {!selectionMode && selId && <NoteEditor id={selId} onClose={() => setSelId(null)} onSaved={() => { setSelId(null); load(); }} onDeleted={() => { setSelId(null); load(); }} />}
      {adding && <NoteEditor id={null} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </Shell>
  );
}
