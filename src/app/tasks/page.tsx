"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import PageHeader from "@/components/PageHeader";
import { STATUS_STYLE, PRIORITY_STYLE, Tag, fmtDue } from "@/components/TaskBits";
import TaskEditor from "@/components/TaskEditor";

type SortField = "priority" | "dueAt";
const PRIORITY_ORDER: Record<string, number> = { low: 1, medium: 2, high: 3 };

// Due-date comparison: soonest first, undated tasks pushed to the bottom.
function cmpDueAsc(a: any, b: any): number {
  const av = a.dueAt ? +new Date(a.dueAt) : Infinity;
  const bv = b.dueAt ? +new Date(b.dueAt) : Infinity;
  return av - bv;
}

export default function TasksPage() {
  const [list, setList] = useState<any[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ field: SortField | null; dir: "asc" | "desc" }>({ field: null, dir: "asc" });
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const [peopleList, setPeopleList] = useState<Array<{ id: string; name: string }>>([]);
  const [projectsList, setProjectsList] = useState<Array<{ id: string; title: string }>>([]);

  async function load() {
    const t = await fetch("/api/tasks").then((r) => r.json()).catch(() => []);
    setList(Array.isArray(t) ? t : []);
  }
  useEffect(() => {
    load();
    fetch("/api/contacts").then((r) => r.json()).then((j) => { if (Array.isArray(j)) setPeopleList(j); }).catch(() => {});
    fetch("/api/projects").then((r) => r.json()).then((j) => { if (Array.isArray(j)) setProjectsList(j); }).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter((t) =>
      (t.title || "").toLowerCase().includes(s) || (t.description || "").toLowerCase().includes(s)
      || (t.status || "").toLowerCase().includes(s) || (t.priority || "").toLowerCase().includes(s)
      || (t.contact?.name || "").toLowerCase().includes(s) || (t.project?.title || "").toLowerCase().includes(s));
  }, [list, q]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sort.field === "priority") {
      // Sort by priority (asc: low→high, desc: high→low). Ties broken by the
      // current due-date ordering so within-priority order matches the due setting.
      const dir = sort.dir === "asc" ? 1 : -1;
      arr.sort((a, b) => {
        const cmp = ((PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)) * dir;
        if (cmp !== 0) return cmp;
        return cmpDueAsc(a, b); // tiebreaker always soonest-first
      });
    } else if (sort.field === "dueAt") {
      // Explicit due-date sort. asc = soonest first, desc = soonest last.
      arr.sort((a, b) => (sort.dir === "asc" ? 1 : -1) * cmpDueAsc(a, b));
    } else {
      // Default: due date soonest first, undated pushed to the bottom.
      arr.sort(cmpDueAsc);
    }
    return arr;
  }, [filtered, sort]);

  function toggleSort(field: SortField) {
    setSort((s) => {
      if (s.field !== field) return { field, dir: "asc" };
      if (s.dir === "asc") return { field, dir: "desc" };
      return { field: null, dir: "asc" }; // third click → back to default
    });
  }

  const arrow = (field: SortField) =>
    sort.field === field ? <span className="text-[8px] leading-none">{sort.dir === "asc" ? "▲" : "▼"}</span> : null;

  // ---- bulk selection + actions ----
  const allShownChecked = sorted.length > 0 && sorted.every((t) => checkedIds.has(t.id));
  // Selection mode: once any card is checked, tapping a card toggles it
  // instead of opening the editor (same pattern as Notes/Files pages).
  const selectionMode = checkedIds.size > 0;
  function onCardClick(id: string) {
    if (selectionMode) toggleChecked(id);
    else setSelId(id);
  }
  function toggleSelectAll() {
    setCheckedIds(allShownChecked ? new Set() : new Set(sorted.map((t) => t.id)));
  }
  function toggleChecked(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function runBulk(action: () => Promise<{ count: number; note?: string }>) {
    if (bulkBusy) return;
    setBulkBusy(true); setBulkMsg("");
    action()
      .then(({ count, note }) => {
        setBulkMsg(note || `Done for ${count} task${count === 1 ? "" : "s"}.`);
        load();
      })
      .catch((e: any) => setBulkMsg(e?.message || "Bulk action failed."))
      .finally(() => setBulkBusy(false));
  }
  function bulkLink(field: "contactId" | "projectId", id: string) {
    if (!id || !checkedIds.size) return;
    const ids = [...checkedIds];
    runBulk(async () => {
      const r = await fetch("/api/tasks", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, [field]: id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not link tasks.");
      return { count: typeof j.updated === "number" ? j.updated : ids.length };
    });
  }
  function bulkSet(field: "status" | "priority", value: string) {
    if (!value || !checkedIds.size) return;
    const ids = [...checkedIds];
    const label = field === "status" ? "status" : "priority";
    const pretty = value.replace("-", " ");
    runBulk(async () => {
      const r = await fetch("/api/tasks", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, [field]: value }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Could not set ${label}.`);
      const n = typeof j.updated === "number" ? j.updated : ids.length;
      return { count: n, note: `Set ${label} to “${pretty}” for ${n} task${n === 1 ? "" : "s"}.` };
    });
  }
  function bulkDelete() {
    const ids = [...checkedIds];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected task${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    runBulk(async () => {
      const r = await fetch("/api/tasks", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not delete tasks.");
      setCheckedIds(new Set());
      const n = typeof j.deleted === "number" ? j.deleted : ids.length;
      return { count: n, note: `Deleted ${n} task${n === 1 ? "" : "s"}.` };
    });
  }

  return (
    <Shell wide>
      <PageHeader icon="tasks" title="Tasks" count={filtered.length}
        search={{ value: q, onChange: setQ, placeholder: "Search tasks…" }}
        actions={
          checkedIds.size ? (
            <>
              {/* Desktop-only count so the mobile grid stays exactly 6 cells / 3 rows */}
              <span className="hidden md:inline text-xs text-slate-500 dark:text-zinc-400 whitespace-nowrap">{checkedIds.size} selected</span>
              <select className="input !w-full md:!w-auto !h-7 !py-0 text-xs" value="" disabled={bulkBusy} title="Link selected tasks to a person"
                onChange={(e) => { const v = e.target.value; e.target.value = ""; bulkLink("contactId", v); }}>
                <option value="">Link Person…</option>
                {peopleList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="input !w-full md:!w-auto !h-7 !py-0 text-xs" value="" disabled={bulkBusy} title="Link selected tasks to a project"
                onChange={(e) => { const v = e.target.value; e.target.value = ""; bulkLink("projectId", v); }}>
                <option value="">Link Project…</option>
                {projectsList.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <select className="input !w-full md:!w-auto !h-7 !py-0 text-xs" value="" disabled={bulkBusy} title="Set status for selected tasks"
                onChange={(e) => { const v = e.target.value; e.target.value = ""; bulkSet("status", v); }}>
                <option value="">Set Status…</option>
                <option value="todo">To-do</option>
                <option value="in-progress">In progress</option>
                <option value="done">Done</option>
              </select>
              <select className="input !w-full md:!w-auto !h-7 !py-0 text-xs" value="" disabled={bulkBusy} title="Set priority for selected tasks"
                onChange={(e) => { const v = e.target.value; e.target.value = ""; bulkSet("priority", v); }}>
                <option value="">Set Priority…</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <button className="btn !w-full md:!w-auto !h-7 !py-0 px-3 text-xs !bg-red-600 hover:!bg-red-700 !text-white" disabled={bulkBusy} onClick={bulkDelete} title="Delete selected tasks">
                {bulkBusy ? "Working…" : "Delete"}
              </button>
              <button className="btn-ghost !w-full md:!w-auto !h-7 !py-0 text-xs rounded-xl md:!rounded-lg border border-slate-200 dark:border-zinc-700 md:border-0" disabled={bulkBusy} onClick={() => { setCheckedIds(new Set()); setBulkMsg(""); }} title="Clear selection">Cancel</button>
            </>
          ) : (
            <button className="btn !py-1.5 flex items-center justify-center gap-1.5 col-span-2" onClick={() => setAdding(true)}><span className="text-base leading-none">+</span> Add</button>
          )
        } />
      {!!bulkMsg && <div className="text-xs text-slate-500 dark:text-zinc-400 mb-2">{bulkMsg}</div>}
      <div className="card !p-0 overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200 dark:border-zinc-800">
            <th className="px-3 py-2 w-8">
              <input type="checkbox" checked={allShownChecked} onChange={toggleSelectAll}
                className="cbx" title="Select all shown tasks" aria-label="Select all shown tasks" />
            </th>
            <th className="px-4 py-2 font-medium">Title</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">
              <button onClick={() => toggleSort("priority")} className="inline-flex items-center gap-1 hover:text-slate-600 dark:hover:text-zinc-200">Priority {arrow("priority")}</button>
            </th>
            <th className="px-4 py-2 font-medium">
              <button onClick={() => toggleSort("dueAt")} className="inline-flex items-center gap-1 hover:text-slate-600 dark:hover:text-zinc-200">Due date {arrow("dueAt")}</button>
            </th>
          </tr></thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.id} onClick={() => setSelId(t.id)} className="table-row cursor-pointer">
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={checkedIds.has(t.id)} onChange={() => toggleChecked(t.id)}
                    className="cbx" aria-label={`Select ${t.title || "task"}`} />
                </td>
                <td className="px-4 py-2 font-medium">{t.title}</td>
                <td className="px-4 py-2"><Tag v={t.status} map={STATUS_STYLE} /></td>
                <td className="px-4 py-2"><Tag v={t.priority} map={PRIORITY_STYLE} /></td>
                <td className="px-4 py-2 text-slate-500 dark:text-zinc-400">{fmtDue(t.dueAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <div className="p-4 text-sm text-slate-500">{list.length ? "No tasks match your search." : "No tasks yet."}</div>}
      </div>

      {/* Mobile: Select All + sort buttons, then task cards */}
      <div className="flex items-center justify-between mb-3 md:hidden">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="cbx" checked={allShownChecked} onChange={toggleSelectAll}
            title="Select all shown tasks" aria-label="Select all shown tasks" />
          <span className="text-sm text-slate-500 dark:text-zinc-400">Select All</span>
        </label>
        <div className="flex items-center gap-0.5">
          <span className="text-sm text-slate-500 dark:text-zinc-400 mr-1">Sort:</span>
          <button className="btn-ghost !px-2 !py-1 text-sm" onClick={() => toggleSort("priority")}
            title="Sort by priority">P {arrow("priority")}</button>
          <button className="btn-ghost !px-2 !py-1 text-sm" onClick={() => toggleSort("dueAt")}
            title="Sort by due date">D {arrow("dueAt")}</button>
        </div>
      </div>
      <div className="md:hidden space-y-3">
        {sorted.map((t) => {
          const checked = checkedIds.has(t.id);
          return (
            <div key={t.id} className={`card !p-4 cursor-pointer ${checked ? "!border-brand-500 ring-2 ring-brand-500/30" : ""}`}
              onClick={() => onCardClick(t.id)}>
              <div className="text-base font-semibold leading-snug">{t.title}</div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Tag v={t.status} map={STATUS_STYLE} />
                <Tag v={t.priority} map={PRIORITY_STYLE} />
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-sm text-slate-500 dark:text-zinc-400">{fmtDue(t.dueAt)}</span>
                <input type="checkbox" className="cbx" checked={checked} onChange={() => toggleChecked(t.id)}
                  onClick={(e) => e.stopPropagation()} aria-label={`Select ${t.title || "task"}`} />
              </div>
            </div>
          );
        })}
        {!filtered.length && <div className="card text-sm text-slate-500">{list.length ? "No tasks match your search." : "No tasks yet."}</div>}
      </div>

      {!selectionMode && selId && <TaskEditor id={selId} onClose={() => setSelId(null)} onSaved={() => { setSelId(null); load(); }} onDeleted={() => { setSelId(null); load(); }} />}
      {adding && <TaskEditor id={null} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </Shell>
  );
}
