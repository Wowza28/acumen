"use client";
import { useEffect, useState } from "react";
import { STATUS, PRIORITY } from "@/components/TaskBits";
import { IconTrash } from "@/components/icons";
import SlideOver from "@/components/SlideOver";

export default function TaskEditor({ id, onClose, onSaved, onDeleted }: {
  id: string | null; onClose: () => void; onSaved: () => void; onDeleted?: () => void;
}) {
  const isNew = !id;
  const [form, setForm] = useState<any>(isNew ? { title: "", status: "todo", priority: "medium", dueAt: "", contactId: null, projectId: null, description: "" } : null);
  const [people, setPeople] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/contacts").then((r) => r.json()).then((j) => Array.isArray(j) && setPeople(j)).catch(() => {});
    fetch("/api/projects").then((r) => r.json()).then((j) => Array.isArray(j) && setProjects(j)).catch(() => {});
    if (isNew) return;
    fetch("/api/tasks").then((r) => r.json()).then((all: any[]) => {
      const t = (Array.isArray(all) ? all : []).find((x) => x.id === id);
      if (t) setForm({ ...t, dueAt: t.dueAt ? new Date(t.dueAt).toISOString().slice(0, 10) : "" });
    }).catch(() => {});
  }, [id]);

  async function save() {
    if (isNew) {
      await fetch("/api/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title, description: form.description,
          status: form.status, priority: form.priority, dueAt: form.dueAt || null,
          contactId: form.contactId || null, projectId: form.projectId || null
        })
      });
    } else {
      await fetch("/api/tasks", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id, title: form.title, description: form.description,
          status: form.status, priority: form.priority, dueAt: form.dueAt || null,
          contactId: form.contactId || null, projectId: form.projectId || null
        })
      });
    }
    onSaved();
  }

  async function del() {
    if (!confirm("Delete this task?")) return;
    await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
    onDeleted ? onDeleted() : onSaved();
  }

  return (
    <SlideOver
      onClose={onClose}
      label="Task"
      title={isNew ? "New task" : (form?.title || "Untitled")}
      actions={form && (
        <>
          <button className="btn !py-1 !px-3" onClick={save}>Save</button>
          {!isNew && <button className="icon-btn !text-red-500" title="Delete task" onClick={del}><IconTrash /></button>}
        </>
      )}
    >
      {!form ? (
        <div className="text-sm text-slate-400 animate-pulse">Loading…</div>
      ) : (
        <>
          <label className="text-xs text-slate-400">Title</label>
          <input className="input mb-3 mt-1" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="text-xs text-slate-400">Status</label>
              <select className="input mt-1" value={form.status || "todo"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400">Priority</label>
              <select className="input mt-1" value={form.priority || "medium"} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITY.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <label className="text-xs text-slate-400">Due date</label>
          <input type="date" className="input mb-3 mt-1" value={form.dueAt || ""} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
          <label className="text-xs text-slate-400">Person</label>
          <select className="input mb-3 mt-1" value={form.contactId || ""} onChange={(e) => setForm({ ...form, contactId: e.target.value || null })}>
            <option value="">— none —</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className="text-xs text-slate-400">Project</label>
          <select className="input mb-3 mt-1" value={form.projectId || ""} onChange={(e) => setForm({ ...form, projectId: e.target.value || null })}>
            <option value="">— none —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <label className="text-xs text-slate-400">Description</label>
          <textarea className="input mt-1 min-h-[160px]" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </>
      )}
    </SlideOver>
  );
}
