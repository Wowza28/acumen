"use client";
import { useEffect, useState, type ReactNode } from "react";
import SlideOver from "@/components/SlideOver";
import { IconPencil, IconTrash } from "@/components/icons";
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
  const currentContactId = links.find((l) => l.contactId)?.contactId || "";
  const currentProjectId = links.find((l) => l.projectId)?.projectId || "";

  /** Single-select linking (matches the Note/Task editors): normalize the
   *  event's links to at most one row carrying the chosen person + project. */
  async function setLinked(field: "contactId" | "projectId", value: string) {
    if (busy) return;
    const prev = field === "contactId" ? currentContactId : currentProjectId;
    if (prev === value) return;
    const nextContact = field === "contactId" ? value : currentContactId;
    const nextProject = field === "projectId" ? value : currentProjectId;
    setBusy(true);
    try {
      for (const l of links) {
        await fetch(`/api/event-links?id=${encodeURIComponent(l.id)}`, { method: "DELETE" });
      }
      if (nextContact || nextProject) {
        await fetch("/api/event-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventUid: uid,
            eventTitle: ev!.summary || "",
            eventStart: ev!.start || "",
            eventEnd: ev!.end || "",
            ...(nextContact ? { contactId: nextContact } : {}),
            ...(nextProject ? { projectId: nextProject } : {}),
          }),
        });
      }
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

      <Row label="Person">
        <select className="input !py-1.5 text-xs" value={currentContactId} disabled={busy}
          onChange={(e) => setLinked("contactId", e.target.value)}>
          <option value="">— none —</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Row>
      <Row label="Project">
        <select className="input !py-1.5 text-xs" value={currentProjectId} disabled={busy}
          onChange={(e) => setLinked("projectId", e.target.value)}>
          <option value="">— none —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </Row>
    </>
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

