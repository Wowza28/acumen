"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import PageHeader from "@/components/PageHeader";
import ProjectLogo from "@/components/ProjectLogo";
import { ProjectStatusTag, fmtAED } from "@/components/TaskBits";
import ProjectEditor from "@/components/ProjectEditor";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(+dt) ? "—" : dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Next Deadline default = soonest linked task that isn't done; else the stored override.
function nextDeadline(p: any): string | null {
  if (p.nextDeadline) return p.nextDeadline;
  const dues = (p.tasks || [])
    .filter((t: any) => t.dueAt && t.status !== "done")
    .map((t: any) => new Date(t.dueAt).getTime())
    .sort((a: number, b: number) => a - b);
  return dues.length ? new Date(dues[0]).toISOString() : null;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  async function load() {
    const j = await fetch("/api/projects").then((r) => r.json()).catch(() => []);
    setList(Array.isArray(j) ? j : []);
  }
  useEffect(() => { load(); }, []);

  const filtered = list.filter((p) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (p.title || "").toLowerCase().includes(s) || (p.company || "").toLowerCase().includes(s) || (p.status || "").toLowerCase().includes(s);
  });

  return (
    <Shell wide>
      <PageHeader icon="projects" title="Projects" count={filtered.length}
        search={{ value: q, onChange: setQ, placeholder: "Search projects…" }}
        actions={
          <button className="btn !py-1.5 flex items-center justify-center gap-1.5 col-span-2" onClick={() => setAdding(true)}><span className="text-base leading-none">+</span> Add</button>
        } />
      <div className="card !p-0 overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200 dark:border-zinc-800">
            <th className="px-2 py-2 font-medium w-0">Logo</th>
            <th className="px-4 py-2 font-medium">Title</th>
            <th className="px-4 py-2 font-medium">Company</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Next Deadline</th>
            <th className="px-4 py-2 font-medium">Point of Contact</th>
            <th className="px-4 py-2 font-medium">Expected Revenue</th>
            <th className="px-4 py-2 font-medium">Expected Completion</th>
          </tr></thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} onClick={() => router.push(`/projects/${p.id}`)} className="table-row cursor-pointer">
                <td className="px-2 py-2 w-0 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <ProjectLogo projectId={p.id} logoUrl={p.logo ? `/api/projects/logo?id=${p.id}` : null} compact onUploaded={load} />
                </td>
                <td className="px-4 py-2 font-medium">{p.title}</td>
                <td className="px-4 py-2 text-slate-500 dark:text-zinc-400">{p.company || "—"}</td>
                <td className="px-4 py-2"><ProjectStatusTag status={p.status} /></td>
                <td className="px-4 py-2 text-slate-500 dark:text-zinc-400 whitespace-nowrap">{fmtDate(nextDeadline(p))}</td>
                <td className="px-4 py-2 text-slate-500 dark:text-zinc-400">{p.poc?.name || "—"}</td>
                <td className="px-4 py-2 text-slate-500 dark:text-zinc-400 whitespace-nowrap">{fmtAED(p.projectedRevenue)}</td>
                <td className="px-4 py-2 text-slate-500 dark:text-zinc-400 whitespace-nowrap">{fmtDate(p.expectedCompletion)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        
      </div>
      <div className="md:hidden space-y-3">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="card !p-4 cursor-pointer transition hover:shadow-md mb-3"
            onClick={() => router.push(`/projects/${p.id}`)}
          >
            <div className="flex items-center gap-3 text-left">
              <span onClick={(e) => e.stopPropagation()}>
                <ProjectLogo
                  projectId={p.id}
                  logoUrl={p.logo ? `/api/projects/logo?id=${p.id}` : null}
                  compact
                  onUploaded={load}
                />
              </span>
              <span className="text-lg font-semibold leading-tight truncate min-w-0 flex-1">{p.title}</span>
              <span className="shrink-0"><ProjectStatusTag status={p.status} /></span>
            </div>
            <div className="text-left text-sm text-slate-500 dark:text-zinc-400 mt-3 leading-relaxed">
              <div>Company: {p.company || "—"}</div>
              <div>Point of Contact: {p.poc?.name || "—"}</div>
              <div>Expected Revenue: {fmtAED(p.projectedRevenue)}</div>
              <div>Next Deadline: {fmtDate(nextDeadline(p))}</div>
              <div>Expected Completion: {fmtDate(p.expectedCompletion)}</div>
            </div>
          </div>
        ))}
      </div>
      {!filtered.length && <div className="p-4 text-sm text-slate-500">{list.length ? "No projects match your search." : "No projects yet."}</div>}
      {adding && <ProjectEditor onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </Shell>
  );
}
