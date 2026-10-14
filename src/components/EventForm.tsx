"use client";
import { useEffect, useState, type ReactNode } from "react";

export type EventDraft = {
  uid?: string;
  summary: string;
  start: string; // YYYY-MM-DD
  startTime: string; // HH:MM (24h)
  end: string; // YYYY-MM-DD
  endTime: string; // HH:MM
  allDay: boolean;
  location: string;
  description: string;
  meetingLink: string;
  guests: string; // comma-separated names or emails
};

function pad(n: number) { return String(n).padStart(2, "0"); }
export function dateStr(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function timeStr(d: Date): string { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

// Build a blank draft, or prefill from an existing event / a clicked day+time.
export function makeDraft(opts?: { ev?: any; date?: Date; hour?: number }): EventDraft {
  const o = opts || {};
  if (o.ev) {
    const s = o.ev.start ? new Date(o.ev.start) : new Date();
    const e = o.ev.end ? new Date(o.ev.end) : new Date(s.getTime() + 3600000);
    return {
      uid: o.ev.uid,
      summary: o.ev.summary || "",
      start: dateStr(s), startTime: o.ev.allDay ? "09:00" : timeStr(s),
      end: dateStr(e), endTime: o.ev.allDay ? "10:00" : timeStr(e),
      allDay: !!o.ev.allDay,
      location: o.ev.location || "",
      description: o.ev.description || "",
      meetingLink: o.ev.meetingLink || "",
      guests: (o.ev.attendees || []).map((a: any) => a.email).join(", "),
    };
  }
  const base = o.date ? new Date(o.date) : new Date();
  const h = typeof o.hour === "number" ? o.hour : 9;
  const s = new Date(base); s.setHours(h, 0, 0, 0);
  const e = new Date(s.getTime() + 3600000);
  return {
    summary: "", start: dateStr(s), startTime: timeStr(s), end: dateStr(e), endTime: timeStr(e),
    allDay: false, location: "", description: "", meetingLink: "", guests: "",
  };
}

// Serialize a draft into the API body (ISO datetimes).
export function draftToBody(d: EventDraft) {
  const mk = (date: string, time: string) => {
    const [y, mo, da] = (date || "").split("-").map(Number);
    const [hh, mm] = (time || "00:00").split(":").map(Number);
    const dt = new Date(y || 1970, (mo || 1) - 1, da || 1, hh || 0, mm || 0, 0, 0);
    return dt.toISOString();
  };
  const body: any = {
    summary: (d.summary || "").trim(),
    start: mk(d.start, d.allDay ? "00:00" : d.startTime),
    allDay: d.allDay,
    location: d.location,
    description: d.description,
    meetingLink: d.meetingLink,
    guests: d.guests.split(",").map((g) => g.trim()).filter(Boolean),
  };
  body.end = mk(d.end || d.start, d.allDay ? "00:00" : d.endTime);
  return body;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-sm flex flex-col gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export default function EventForm({ draft, setDraft }: { draft: EventDraft; setDraft: (d: EventDraft) => void }) {
  const set = (patch: Partial<EventDraft>) => setDraft({ ...draft, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <Row label="Title">
        <input className="input" value={draft.summary} onChange={(e) => set({ summary: e.target.value })} placeholder="Add title" autoFocus />
      </Row>
      <div className="flex items-center gap-2">
        <input id="ev-allday" type="checkbox" className="accent-brand-500" checked={draft.allDay} onChange={(e) => set({ allDay: e.target.checked })} />
        <label htmlFor="ev-allday" className="text-sm">All day</label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Row label="Start date">
          <input type="date" className="input" value={draft.start} onChange={(e) => set({ start: e.target.value, end: e.target.value > (draft.end || "") ? e.target.value : draft.end })} />
        </Row>
        {!draft.allDay && (
          <Row label="Start time">
            <input type="time" className="input" value={draft.startTime} onChange={(e) => set({ startTime: e.target.value })} />
          </Row>
        )}
        <Row label="End date">
          <input type="date" className="input" value={draft.end} onChange={(e) => set({ end: e.target.value })} />
        </Row>
        {!draft.allDay && (
          <Row label="End time">
            <input type="time" className="input" value={draft.endTime} onChange={(e) => set({ endTime: e.target.value })} />
          </Row>
        )}
      </div>
      <Row label="Location">
        <input className="input" value={draft.location} onChange={(e) => set({ location: e.target.value })} placeholder="Add location" />
      </Row>
      <Row label="Meeting link">
        <input className="input" value={draft.meetingLink} onChange={(e) => set({ meetingLink: e.target.value })} placeholder="Zoom / Meet URL" />
      </Row>
      <Row label="Guests">
        <input className="input" value={draft.guests} onChange={(e) => set({ guests: e.target.value })} placeholder="Names or emails, comma-separated" />
      </Row>
      <Row label="Description">
        <textarea rows={4} className="input" value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="Add description" />
      </Row>
    </div>
  );
}
