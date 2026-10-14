"use client";
import { useEffect, useState } from "react";
import { IconCheck, IconPencil, IconPlus, IconTrash, IconX } from "@/components/icons";

type Row = { id: string; value: string; label?: string | null; isDefault?: boolean };
type Kind = "email" | "phone";

// Multi-value editor for a contact's emails or phones. Shows every row
// (default first); user can set default, edit, remove, and add. Keeps the
// denormalized Contact.email/phone column in sync via the server.
export default function ContactFields({
  contactId, kind, label, onChanged
}: {
  contactId: string;
  kind: Kind;
  label: string;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const j = await fetch("/api/contacts/fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: contactId, kind, op: "list" })
    }).then((r) => r.json()).catch(() => null);
    if (j && !j.error) setRows(kind === "email" ? j.emails || [] : j.phones || []);
    else setRows([]);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [contactId, kind]);

  async function call(body: any) {
    setBusy(true);
    try {
      await fetch("/api/contacts/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contactId, kind, ...body })
      });
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  function startAdd() { setAdding(true); setDraft(""); }
  function cancelAdd() { setAdding(false); setDraft(""); }
  async function confirmAdd() {
    const v = draft.trim();
    if (!v) return;
    await call({ op: "add", values: [{ value: v }] });
    setAdding(false); setDraft("");
  }
  async function setDefault(rowId: string) { await call({ op: "setDefault", rowId }); }
  async function remove(rowId: string) { await call({ op: "remove", rowId }); }
  function startEdit(r: Row) { setEditingId(r.id); setEditDraft(r.value); }
  function cancelEdit() { setEditingId(null); setEditDraft(""); }
  async function confirmEdit(rowId: string) {
    const v = editDraft.trim();
    if (!v) return;
    await call({ op: "edit", rowId, value: v });
    setEditingId(null); setEditDraft("");
  }

  const inputType = kind === "email" ? "email" : "tel";
  const placeholder = kind === "email" ? "Email" : "Phone number";

  return (
    <div className="text-sm">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-slate-400 capitalize">{label}</div>
        {!adding && (
          <button className="icon-btn !p-0.5" title={`Add ${label}`} disabled={busy} onClick={startAdd}>
            <IconPlus className="!w-4 !h-4" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {(rows || []).map((r) => (
          <div key={r.id} className="flex items-center gap-2 group">
            {editingId === r.id ? (
              <>
                <input className="input !py-1 flex-1 min-w-0" type={inputType} value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmEdit(r.id); if (e.key === "Escape") cancelEdit(); }}
                  disabled={busy} autoFocus />
                <button className="icon-btn !p-1 text-green-600 shrink-0" title="Confirm"
                  disabled={busy || !editDraft.trim()} onClick={() => confirmEdit(r.id)}>
                  <IconCheck />
                </button>
                <button className="icon-btn !p-1 shrink-0" title="Cancel" disabled={busy} onClick={cancelEdit}>
                  <IconX />
                </button>
              </>
            ) : (
              <>
                <button
                  title={r.isDefault ? "Default" : "Set as default"}
                  disabled={busy || r.isDefault}
                  onClick={() => setDefault(r.id)}
                  className={`shrink-0 w-5 h-5 rounded border text-[11px] font-semibold leading-none flex items-center justify-center transition-colors ${
                    r.isDefault
                      ? "bg-brand-500 text-white border-brand-500"
                      : "border-slate-300 dark:border-zinc-600 text-transparent group-hover:text-slate-400 hover:!border-slate-400 hover:!text-slate-500 dark:hover:!text-zinc-300 cursor-pointer"
                  }`}
                >D</button>
                <span className="font-medium truncate flex-1">{r.value}</span>
                <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  <button className="icon-btn !p-1" title="Edit"
                    disabled={busy} onClick={() => startEdit(r)}>
                    <IconPencil />
                  </button>
                  <button className="icon-btn !p-1 text-red-500" title="Remove"
                    disabled={busy} onClick={() => remove(r.id)}>
                    <IconTrash />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {rows === null && <span className="text-xs text-slate-400 animate-pulse">Loading…</span>}
        {rows && !rows.length && !adding && <span className="text-xs text-slate-400">None yet.</span>}
        {adding && (
          <div className="flex items-center gap-1.5">
            <input className="input !py-1 flex-1 min-w-0" type={inputType} placeholder={placeholder} value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmAdd(); if (e.key === "Escape") cancelAdd(); }}
              disabled={busy} autoFocus />
            <button className="icon-btn !p-1 text-green-600 shrink-0" title="Confirm" disabled={busy || !draft.trim()} onClick={confirmAdd}>
              <IconCheck />
            </button>
            <button className="icon-btn !p-1 shrink-0" title="Cancel" disabled={busy} onClick={cancelAdd}>
              <IconX />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
