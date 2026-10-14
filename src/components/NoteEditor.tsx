"use client";
import { useEffect, useState } from "react";
import { IconTrash } from "@/components/icons";
import SlideOver from "@/components/SlideOver";

export default function NoteEditor({ id, onClose, onSaved, onDeleted }: {
  id: string | null; onClose: () => void; onSaved: () => void; onDeleted?: () => void;
}) {
  const isNew = !id;
  const [form, setForm] = useState<any>(isNew ? { title: "", body: "", contactId: null, projectId: null } : null);
  const [people, setPeople] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/contacts").then((r) => r.json()).then((j) => Array.isArray(j) && setPeople(j)).catch(() => {});
    fetch("/api/projects").then((r) => r.json()).then((j) => Array.isArray(j) && setProjects(j)).catch(() => {});
    if (isNew) return;
    fetch("/api/notes").then((r) => r.json()).then((all: any[]) => {
      const n = (Array.isArray(all) ? all : []).find((x) => x.id === id);
      if (n) setForm({ ...n });
    }).catch(() => {});
  }, [id]);

  async function save() {
    if (isNew) {
      await fetch("/api/notes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, body: form.body, contactId: form.contactId || null, projectId: form.projectId || null })
      });
    } else {
      await fetch("/api/notes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: form.id, title: form.title, body: form.body, contactId: form.contactId || null, projectId: form.projectId || null })
      });
    }
    onSaved();
  }

  async function del() {
    if (!confirm("Delete this note?")) return;
    await fetch(`/api/notes?id=${id}`, { method: "DELETE" });
    onDeleted ? onDeleted() : onSaved();
  }

  return (
    <SlideOver
      onClose={onClose}
      label="Note"
      title={isNew ? "New note" : (form?.title || "Untitled")}
      actions={form && (
        <>
          <button className="btn !py-1 !px-3" onClick={save}>Save</button>
          {!isNew && <button className="icon-btn !text-red-500" title="Delete note" onClick={del}><IconTrash /></button>}
        </>
      )}
    >
      {!form ? (
        <div className="text-sm text-slate-400 animate-pulse">Loading…</div>
      ) : (
        <>
          <label className="text-xs text-slate-400">Title</label>
          <input className="input mb-3 mt-1" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
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
          <label className="text-xs text-slate-400">Content</label>
          <textarea className="input mt-1 min-h-[240px]" value={form.body || ""} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </>
      )}
    </SlideOver>
  );
}
