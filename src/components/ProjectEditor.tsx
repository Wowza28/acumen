"use client";
import { useEffect, useState } from "react";
import SlideOver from "@/components/SlideOver";
import { PROJECT_STATUS, PROJECT_STATUS_LABEL } from "@/components/TaskBits";

// Create a new Project via a sliding panel. POSTs to /api/projects. Lets the
// user link people at creation and (optionally) set a Point of Contact from
// among the people they just linked.
export default function ProjectEditor({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>({
    title: "", company: "", status: "planned", description: "",
    inceptionAt: "", nextDeadline: "", expectedCompletion: "",
    projectedRevenue: "", revenue: "", pocId: "", contactIds: [] as string[],
  });
  const [people, setPeople] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (patch: any) => setForm({ ...form, ...patch });

  useEffect(() => {
    fetch("/api/contacts").then((r) => r.json()).then((j) => Array.isArray(j) && setPeople(j)).catch(() => {});
  }, []);

  function toggleContact(id: string) {
    const has = form.contactIds.includes(id);
    const next = has ? form.contactIds.filter((x: string) => x !== id) : [...form.contactIds, id];
    const patch: any = { contactIds: next };
    if (!has && form.contactIds.length === 0) patch.pocId = id; // first linked person → default POC
    if (has && form.pocId === id) patch.pocId = "";
    set(patch);
  }

  async function save() {
    if (!form.title.trim()) { setErr("Title is required."); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          company: form.company.trim() || undefined,
          status: form.status,
          description: form.description || undefined,
          inceptionAt: form.inceptionAt || undefined,
          nextDeadline: form.nextDeadline || undefined,
          expectedCompletion: form.expectedCompletion || undefined,
          projectedRevenue: form.projectedRevenue === "" ? undefined : Number(form.projectedRevenue),
          revenue: form.revenue === "" ? undefined : Number(form.revenue),
          pocId: form.pocId || undefined,
          contactIds: form.contactIds,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr(j.error || "Could not create the project."); setBusy(false); return; }
      onSaved();
    } catch (e: any) {
      setErr(e?.message || "Could not create the project."); setBusy(false);
    }
  }

  const linkedPeople = people.filter((p) => form.contactIds.includes(p.id));
  return (
    <SlideOver
      onClose={onClose}
      width="max-w-[480px]"
      label="Project"
      title="New project"
      actions={<button className="btn !py-1 !px-3" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>}
    >
      <div className="flex flex-col gap-3">
        <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">Title</span>
          <input className="input" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Project name" autoFocus /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">Company</span>
            <input className="input" value={form.company} onChange={(e) => set({ company: e.target.value })} /></label>
          <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">Status</span>
            <select className="input" value={form.status} onChange={(e) => set({ status: e.target.value })}>
              {PROJECT_STATUS.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
            </select></label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">Inception date</span>
            <input type="date" className="input" value={form.inceptionAt} onChange={(e) => set({ inceptionAt: e.target.value })} /></label>
          <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">Next deadline</span>
            <input type="date" className="input" value={form.nextDeadline} onChange={(e) => set({ nextDeadline: e.target.value })} /></label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">Projected revenue (AED)</span>
            <input type="number" className="input" value={form.projectedRevenue} onChange={(e) => set({ projectedRevenue: e.target.value })} placeholder="0" /></label>
          <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">Revenue (AED)</span>
            <input type="number" className="input" value={form.revenue} onChange={(e) => set({ revenue: e.target.value })} placeholder="0" /></label>
        </div>
        <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">Expected completion</span>
          <input type="date" className="input" value={form.expectedCompletion} onChange={(e) => set({ expectedCompletion: e.target.value })} /></label>

        <div className="text-sm flex flex-col gap-1">
          <span className="text-xs text-slate-500">Link people</span>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto border border-slate-200 dark:border-zinc-700 rounded-lg p-2">
            {people.length ? people.map((p) => (
              <button type="button" key={p.id} onClick={() => toggleContact(p.id)}
                className={`text-xs px-2 py-1 rounded-full border ${form.contactIds.includes(p.id) ? "bg-brand-500/15 border-brand-500 text-brand-700 dark:text-brand-300" : "border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"}`}>
                {p.name}
              </button>
            )) : <span className="text-xs text-slate-400">No people yet.</span>}
          </div>
        </div>

        {linkedPeople.length > 0 && (
          <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">Point of contact</span>
            <select className="input" value={form.pocId} onChange={(e) => set({ pocId: e.target.value })}>
              <option value="">— none —</option>
              {linkedPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
        )}

        <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">Description</span>
          <textarea rows={4} className="input" value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Add a description…" /></label>
        {err && <div className="text-sm text-red-500">{err}</div>}
      </div>
    </SlideOver>
  );
}

