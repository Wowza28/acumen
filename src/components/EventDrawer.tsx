"use client";
import { useEffect, useState, type ReactNode } from "react";
import SlideOver from "@/components/SlideOver";
import { IconPeople, IconProject, IconX, IconPencil, IconTrash } from "@/components/icons";
import EventForm, { makeDraft, draftToBody, type EventDraft } from "@/components/EventForm";

export type Ev = {
  uid: string;
  summary?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  location?: string;
  description?: string;
  meetingLink?: string;
  organizer?: string;
  attendees?: Array<{ email: string; name?: string }>;
  auto?: boolean;     // auto-matched to a person (guest email / name in title)
  explicit?: boolean; // explicitly linked via chat or the drawer dropdowns
};

function timeOf(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

type EvLinkRow = {
  id: string;
  contactId?: string | null;
  projectId?: string | null;
  contact?: { id: string; name: string } | null;
  project?: { id: string; title: string } | null;
};

/** Sliding right-hand details panel (Titan-style) for a calendar event, with
 *  controls to manually link it to a Person and/or a Project, plus an Edit mode
 *  that updates the event on Titan. Links are stored locally only (EventLink
 *  rows) — but editing fields writes back to Titan via /api/calendar. */
export default function EventDrawer({ ev, onClose, onChanged }: {
  ev: Ev | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // reset edit state when a different event is opened
  useEffect(() => { setEditing(false); setErr(""); }, [ev?.uid]);

  function startEdit() {
    if (!ev) return;
    setDraft(makeDraft({ ev }));
    setErr("");
    setEditing(true);
  }

  async function saveEdit() {
    if (!ev || !draft) return;
    if (!draft.summary.trim()) { setErr("Add a title."); return; }
    setBusy(true); setErr("");
    try {
      const body = draftToBody(draft);
      const res = await fetch("/api/calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: ev.uid, ...body, replaceGuests: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr(j.error || "Could not save."); setBusy(false); return; }
      setEditing(false);
      onChanged?.();
    } catch (e: any) {
      setErr(e?.message || "Could not save."); setBusy(false);
    }
  }

  async function deleteEvent() {
    if (!ev) return;
    if (!confirm(`Delete "${ev.summary || "this event"}"? This permanently removes it from your Titan calendar.`)) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/calendar?uid=${encodeURIComponent(ev.uid)}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr(j.error || "Could not delete the event."); setBusy(false); return; }
      onChanged?.();
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Could not delete the event."); setBusy(false);
    }
  }

  return (
    <SlideOver
      onClose={onClose}
      width="max-w-[400px]"
      label="Event"
      title={ev?.summary || "(no title)"}
      actions={ev && !editing && (
        <>
          <button className="icon-btn shrink-0 !text-red-500" title="Delete event" disabled={busy} onClick={deleteEvent}><IconTrash /></button>
          <button className="icon-btn shrink-0" title="Edit event" onClick={startEdit}><IconPencil /></button>
        </>
      )}
      bodyClass="px-5 py-4 flex flex-col gap-4 text-sm"
      footer={
        <div className="px-5 py-3 border-t border-slate-100 dark:border-zinc-800 text-xs text-slate-400 dark:text-zinc-500">
          Synced from your Titan calendar · edit or delete here, or ask the AI in chat
        </div>
      }
    >
      {err && <div className="text-sm text-red-500">{err}</div>}
      {editing && draft ? (
        <>
          <EventForm draft={draft} setDraft={setDraft} />
          <div className="flex gap-2 mt-1">
            <button className="btn !py-1.5" onClick={saveEdit} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            <button className="btn-ghost !py-1.5" onClick={() => { setEditing(false); setErr(""); }}>Cancel</button>
          </div>
        </>
      ) : (
        <EventDrawerBody ev={ev} onChanged={onChanged} />
      )}
    </SlideOver>
  );
}

function EventDrawerBody({ ev, onChanged }: { ev: Ev | null; onChanged?: () => void }) {
  const [links, setLinks] = useState<EvLinkRow[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const uid = ev?.uid;

  useEffect(() => {
    if (!uid) { setLinks([]); return; }
    let alive = true;
    const enc = encodeURIComponent(uid);
    fetch(`/api/event-links?eventUid=${enc}`).then((r) => r.json()).then((j) => {
      if (alive && Array.isArray(j?.links)) setLinks(j.links);
    }).catch(() => {});
    fetch("/api/contacts").then((r) => r.json()).then((j) => { if (alive && Array.isArray(j)) setPeople(j); }).catch(() => {});
    fetch("/api/projects").then((r) => r.json()).then((j) => { if (alive && Array.isArray(j)) setProjects(j); }).catch(() => {});
    return () => { alive = false; };
  }, [uid]);

  if (!ev) return null;

  async function refresh() {
    const enc = encodeURIComponent(uid!);
    const j = await fetch(`/api/event-links?eventUid=${enc}`).then((r) => r.json()).catch(() => null);
    if (Array.isArray(j?.links)) setLinks(j.links);
    onChanged?.();
  }
  async function addLink(field: "contactId" | "projectId", id: string) {
    if (!id) return;
    setBusy(true);
    try {
      await fetch("/api/event-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventUid: uid,
          eventTitle: ev!.summary || "",
          eventStart: ev!.start || "",
          eventEnd: ev!.end || "",
          [field]: id,
        }),
      });
      await refresh();
    } finally { setBusy(false); }
  }
  async function removeLink(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/event-links?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh();
    } finally { setBusy(false); }
  }

  const start = ev.start ? new Date(ev.start) : null;
  const end = ev.end ? new Date(ev.end) : null;
  const dateLine = start && !isNaN(+start)
    ? start.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "";
  const timeLine = ev.allDay
    ? "All day"
    : [start && !isNaN(+start) ? timeOf(ev.start) : "", end && !isNaN(+end) ? timeOf(ev.end) : ""].filter(Boolean).join(" – ") || "";

  const linkedContactIds = new Set(links.filter((l) => l.contact).map((l) => l.contactId!));
  const linkedProjectIds = new Set(links.filter((l) => l.project).map((l) => l.projectId!));

  return (
    <>
      {(dateLine || timeLine) && (
        <Row label="When">
          {dateLine && <div>{dateLine}</div>}
          {timeLine && <div className="text-slate-500 dark:text-zinc-400">{timeLine}</div>}
        </Row>
      )}
      {ev.location && (
        <Row label="Location">
          <div className="whitespace-pre-wrap break-words">{ev.location}</div>
        </Row>
      )}
      {ev.meetingLink && (
        <Row label="Meeting link">
          <a href={ev.meetingLink} target="_blank" rel="noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline break-all">{ev.meetingLink}</a>
        </Row>
      )}
      <Row label={ev.attendees?.length ? `Guests (${ev.attendees.length})` : "Guests"}>
        {ev.organizer && (
          <div className="text-slate-600 dark:text-zinc-300">{ev.organizer} <span className="text-slate-400 dark:text-zinc-500">(organizer)</span></div>
        )}
        {ev.attendees?.length ? (
          <ul className="flex flex-col gap-1 mt-1">
            {ev.attendees.map((a) => (
              <li key={a.email} className="break-words">
                {a.name && a.name !== a.email ? <>{a.name} <span className="text-slate-400 dark:text-zinc-500">&lt;{a.email}&gt;</span></> : a.email}
              </li>
            ))}
          </ul>
        ) : !ev.organizer ? (
          <div className="text-slate-400 dark:text-zinc-500">No guests</div>
        ) : null}
      </Row>
      {ev.description && (
        <Row label="Description">
          <div className="whitespace-pre-wrap break-words text-slate-600 dark:text-zinc-300">{ev.description}</div>
        </Row>
      )}

      <Row label="Linked to">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {links.flatMap((l) => {
            const chips: ReactNode[] = [];
            if (l.contact) chips.push(<Chip key={`${l.id}-c`} icon={<IconPeople className="w-3.5 h-3.5" />} label={l.contact.name} disabled={busy} onRemove={() => removeLink(l.id)} />);
            if (l.project) chips.push(<Chip key={`${l.id}-p`} icon={<IconProject className="w-3.5 h-3.5" />} label={l.project.title} disabled={busy} onRemove={() => removeLink(l.id)} />);
            return chips;
          })}
          {!links.length && <span className="text-slate-400 dark:text-zinc-500 text-xs">Not linked to anyone yet.</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <select className="input !py-1 text-xs" value="" disabled={busy}
            onChange={(e) => addLink("contactId", e.target.value)}>
            <option value="">＋ Link a person…</option>
            {people.filter((p) => !linkedContactIds.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input !py-1 text-xs" value="" disabled={busy}
            onChange={(e) => addLink("projectId", e.target.value)}>
            <option value="">＋ Link a project…</option>
            {projects.filter((p) => !linkedProjectIds.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
      </Row>
    </>
  );
}

function Chip({ icon, label, onRemove, disabled }: { icon: ReactNode; label: string; onRemove: () => void; disabled?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-zinc-800 pl-2 pr-1 py-0.5 text-xs">
      {icon}
      <span className="max-w-[18ch] truncate">{label}</span>
      <button className="icon-btn !p-0.5" title="Remove link" disabled={disabled} onClick={onRemove}>
        <IconX className="w-3 h-3" />
      </button>
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-zinc-500 mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}

