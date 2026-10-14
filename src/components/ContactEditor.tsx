"use client";
import { useEffect, useState } from "react";
import SlideOver from "@/components/SlideOver";

// Create a new Person (contact). POSTs to /api/contacts; multiple emails/phones
// can be added as newline/comma-separated values.
export default function ContactEditor({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>({ name: "", email: "", phone: "", company: "", role: "", address: "", emails: "", phones: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (patch: any) => setForm({ ...form, ...patch });

  async function save() {
    if (!form.name.trim()) { setErr("Name is required."); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          company: form.company.trim() || undefined,
          role: form.role.trim() || undefined,
          address: form.address.trim() || undefined,
          emails: splitList(form.emails),
          phones: splitList(form.phones),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr(j.error || "Could not create the person."); setBusy(false); return; }
      onSaved();
    } catch (e: any) {
      setErr(e?.message || "Could not create the person."); setBusy(false);
    }
  }

  return (
    <SlideOver
      onClose={onClose}
      width="max-w-[440px]"
      label="Person"
      title="New person"
      actions={<button className="btn !py-1 !px-3" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>}
    >
      <div className="flex flex-col gap-3">
        <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">Name</span>
          <input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Full name" autoFocus /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">Email</span>
            <input className="input" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="name@company.com" /></label>
          <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">Phone</span>
            <input className="input" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+91…" /></label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">Company</span>
            <input className="input" value={form.company} onChange={(e) => set({ company: e.target.value })} /></label>
          <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">Role</span>
            <input className="input" value={form.role} onChange={(e) => set({ role: e.target.value })} /></label>
        </div>
        <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">Address</span>
          <input className="input" value={form.address} onChange={(e) => set({ address: e.target.value })} /></label>
        <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">More emails (optional)</span>
          <textarea rows={2} className="input" value={form.emails} onChange={(e) => set({ emails: e.target.value })} placeholder="One per line" /></label>
        <label className="text-sm flex flex-col gap-1"><span className="text-xs text-slate-500">More phones (optional)</span>
          <textarea rows={2} className="input" value={form.phones} onChange={(e) => set({ phones: e.target.value })} placeholder="One per line" /></label>
        {err && <div className="text-sm text-red-500">{err}</div>}
      </div>
    </SlideOver>
  );
}

function splitList(s: string): string[] {
  return String(s || "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
}
