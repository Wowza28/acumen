"use client";
import { useState } from "react";
import SlideOver from "@/components/SlideOver";
import EventForm, { makeDraft, draftToBody, type EventDraft } from "@/components/EventForm";

// Create/edit an event on the user's Titan calendar via a sliding panel.
// mode="create" POSTs; mode="edit" PATCHes by uid. `prefill` seeds a new event
// (e.g. from clicking empty space in the week grid); `ev` seeds an edit.
export default function EventEditor({
  onClose,
  onSaved,
  ev,
  prefill,
}: {
  onClose: () => void;
  onSaved: () => void;
  ev?: any;
  prefill?: { date?: Date; hour?: number };
}) {
  const isEdit = !!ev;
  const [draft, setDraft] = useState<EventDraft>(() => makeDraft(isEdit ? { ev } : { date: prefill?.date, hour: prefill?.hour }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!draft.summary.trim()) { setErr("Add a title first."); return; }
    setBusy(true); setErr("");
    try {
      const body = draftToBody(draft);
      const res = isEdit
        ? await fetch("/api/calendar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid: draft.uid, ...body, replaceGuests: true }) })
        : await fetch("/api/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr(j.error || "Could not save the event."); setBusy(false); return; }
      onSaved();
    } catch (e: any) {
      setErr(e?.message || "Could not save the event."); setBusy(false);
    }
  }

  return (
    <SlideOver
      onClose={onClose}
      width="max-w-[440px]"
      label="Event"
      title={isEdit ? "Edit event" : "New event"}
      actions={
        <>
          <button className="btn !py-1 !px-3" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </>
      }
      footer={
        <div className="px-5 py-3 border-t border-slate-100 dark:border-zinc-800 text-xs text-slate-400 dark:text-zinc-500">
          {isEdit ? "Saved to your Titan calendar" : "Creates the event on your Titan calendar"}
        </div>
      }
    >
      <EventForm draft={draft} setDraft={setDraft} />
      {err && <div className="text-sm text-red-500 mt-3">{err}</div>}
    </SlideOver>
  );
}
