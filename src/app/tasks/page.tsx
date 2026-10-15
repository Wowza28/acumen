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

  async function load() {
    const t = await fetch("/api/tasks").then((r) => r.json()).catch(() => []);
    setList(Array.isArray(t) ? t : []);
  }
  useEffect(() => { load(); }, []);

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

  return (
    <Shell wide>
      <PageHeader icon="tasks" title="Tasks" count={filtered.length} right={
        <div className="flex items-center gap-2">
          <input className="input !w-56" placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn !py-1.5 flex items-center gap-1.5" onClick={() => setAdding(true)}><span className="text-base leading-none">+</span> Add</button>
        </div>
      } />
      <div className="card !p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200 dark:border-zinc-800">
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
      {selId && <TaskEditor id={selId} onClose={() => setSelId(null)} onSaved={() => { setSelId(null); load(); }} onDeleted={() => { setSelId(null); load(); }} />}
      {adding && <TaskEditor id={null} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </Shell>
  );
}
