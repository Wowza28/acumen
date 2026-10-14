"use client";
import { useEffect, useState } from "react";

export default function ContactDetail({ id, onChanged }: { id: string | null; onChanged: () => void }) {
  const [c, setC] = useState<any>(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (!id) { setC(null); return; }
    fetch(`/api/contacts/detail?id=${id}`).then((r) => r.json()).then((j) => {
      setC(j); setForm(j); setEdit(false);
    });
  }, [id]);

  if (!id) return <div className="card text-sm text-slate-500">👆 Click a contact to see full details here.</div>;
  if (!c || c.error) return <div className="card text-sm">Loading…</div>;

  async function save() {
    await fetch("/api/contacts/detail", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: form.name, email: form.email, phone: form.phone, company: form.company, role: form.role })
    });
    const j = await fetch(`/api/contacts/detail?id=${id}`).then((r) => r.json());
    setC(j); setEdit(false); onChanged();
  }

  async function del() {
    if (!confirm(`Delete ${c.name}?`)) return;
    await fetch(`/api/contacts/detail?id=${id}`, { method: "DELETE" });
    setC(null); onChanged();
  }

  const F = (k: string, label: string) => (
    <label className="text-sm flex flex-col gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      {edit
        ? <input className="input" value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
        : <span className="font-medium">{c[k] || <i className="text-slate-400">—</i>}</span>}
    </label>
  );

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-3">
        <b>👤 {c.name}</b>
        <div className="flex gap-2 text-xs">
          {edit
            ? <><button className="btn !py-1" onClick={save}>Save</button><button className="underline" onClick={() => setEdit(false)}>Cancel</button></>
            : <button className="underline" onClick={() => setEdit(true)}>Edit</button>}
          <button className="underline text-red-600" onClick={del}>Delete</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {F("name", "Name")}{F("phone", "Phone")}{F("email", "Email")}{F("company", "Company")}
        <div className="col-span-2">{F("role", "Role / Title")}</div>
      </div>
      <div className="text-xs text-slate-400 mt-2">Created {new Date(c.createdAt).toLocaleString()} · Updated {new Date(c.updatedAt).toLocaleString()}</div>
      <div className="mt-3 text-sm">
        <b>Projects ({c.projects?.length || 0})</b>
        <div className="text-slate-600">{c.projects?.map((p: any) => p.project.title).join(", ") || "—"}</div>
      </div>
      <div className="mt-3 text-sm">
        <b>Recent activity ({(c.notes?.length || 0) + (c.meetings?.length || 0) + (c.documents?.length || 0) + (c.emails?.length || 0)})</b>
        <div className="mt-1 flex flex-col gap-1 max-h-48 overflow-y-auto">
          {(c.notes || []).map((n: any) => <div key={n.id} className="border-l-2 border-blue-500 pl-2">📝 {n.body.slice(0, 200)}</div>)}
          {(c.meetings || []).map((m: any) => <div key={m.id} className="border-l-2 border-green-500 pl-2">📅 {m.title} — {new Date(m.startsAt).toLocaleString()}</div>)}
          {(c.documents || []).map((d: any) => <div key={d.id} className="border-l-2 border-purple-500 pl-2">📎 {d.filename}</div>)}
          {(c.emails || []).map((e: any) => <div key={e.id} className="border-l-2 border-amber-500 pl-2">✉️ {e.subject}</div>)}
        </div>
      </div>
    </div>
  );
}
