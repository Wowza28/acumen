"use client";
import { useState } from "react";
import { IconCheck, IconX, IconPencil } from "@/components/icons";

/** Single scalar field (name/company/role/address) with hover pencil + inline edit. */
export default function InlineField({
  label, value, placeholder, onSave
}: {
  label: string;
  value?: string | null;
  placeholder?: string;
  onSave: (v: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  function start() { setDraft(value || ""); setEditing(true); }
  function cancel() { setEditing(false); setDraft(""); }
  async function confirm() {
    setBusy(true);
    try { await onSave(draft.trim()); } finally { setBusy(false); }
    setEditing(false);
  }

  return (
    <div className="text-sm group">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-400 capitalize">{label}</div>
        {!editing && (
          <button className="icon-btn !p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100"
            title={`Edit ${label}`} onClick={start}>
            <IconPencil className="!w-3.5 !h-3.5" />
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex items-center gap-1.5 mt-0.5">
          <input className="input !py-1 flex-1 min-w-0" value={draft}
            placeholder={placeholder || label}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirm(); if (e.key === "Escape") cancel(); }}
            disabled={busy} autoFocus />
          <button className="icon-btn !p-1 text-green-600 shrink-0" title="Confirm"
            disabled={busy} onClick={confirm}>
            <IconCheck />
          </button>
          <button className="icon-btn !p-1 shrink-0" title="Cancel" disabled={busy} onClick={cancel}>
            <IconX />
          </button>
        </div>
      ) : (
        <div className="font-medium truncate">{value || <i className="text-slate-400">—</i>}</div>
      )}
    </div>
  );
}
