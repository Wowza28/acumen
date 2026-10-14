"use client";
import { useEffect, useState } from "react";

export default function Lists({ onSelect }: { onSelect: (kind: string, id: string, name: string) => void }) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  async function load() {
    const c = await fetch("/api/contacts").then((r) => r.json()).catch(() => []);
    const p = await fetch("/api/projects").then((r) => r.json()).catch(() => []);
    setContacts(c); setProjects(p);
  }
  useEffect(() => { load(); }, []);
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div className="card">
        <div className="flex justify-between items-center mb-2">
          <b>Contacts ({contacts.length})</b>
          <button className="text-xs underline" onClick={load}>refresh</button>
        </div>
        <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
          {contacts.map((c) => (
            <button key={c.id} onClick={() => onSelect("contact", c.id, c.name)} className="text-left text-sm border rounded-lg px-2 py-1 hover:bg-slate-50">
              <b>{c.name}</b> <span className="text-slate-500">{c.company || ""} · {c.email || ""}</span>
            </button>
          ))}
          {!contacts.length && <span className="text-xs text-slate-500">No contacts yet — create via chat.</span>}
        </div>
      </div>
      <div className="card">
        <div className="flex justify-between items-center mb-2">
          <b>Projects ({projects.length})</b>
          <button className="text-xs underline" onClick={load}>refresh</button>
        </div>
        <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
          {projects.map((p) => (
            <button key={p.id} onClick={() => onSelect("project", p.id, p.title)} className="text-left text-sm border rounded-lg px-2 py-1 hover:bg-slate-50">
              <b>{p.title}</b> <span className="text-slate-500">[{p.status}]</span>
            </button>
          ))}
          {!projects.length && <span className="text-xs text-slate-500">No projects yet.</span>}
        </div>
      </div>
    </div>
  );
}
