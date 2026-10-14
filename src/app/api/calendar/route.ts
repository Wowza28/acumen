import { NextRequest, NextResponse } from "next/server";
import { fetchTitanEvents, createTitanEvent, updateTitanEvent, deleteTitanEvent } from "@/lib/titan";
import { prisma } from "@/lib/db";
import { activeAccountEmail } from "@/lib/titanAccount";

// GET /api/calendar?from=ISO&to=ISO — live Titan calendar events in a window.
// Defaults to a window spanning the current month if from/to are omitted.
// Also reconciles the active account's cached EventLinks (drops broken ones)
// whenever the calendar is read.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : new Date(now.getFullYear(), now.getMonth() + 1, 1);
    if (isNaN(+from) || isNaN(+to)) {
      return NextResponse.json({ error: "invalid from/to" }, { status: 400 });
    }
    const events = await fetchTitanEvents(from, to);
    // Prune broken links for the active account using this fetch's uids.
    const accountEmail = await activeAccountEmail();
    if (accountEmail && events.length) {
      const links = await prisma.eventLink.findMany({ where: { accountEmail }, select: { id: true, eventUid: true } });
      const live = new Set(events.map((e) => e.uid));
      for (const l of links) {
        if (!live.has(l.eventUid)) {
          await prisma.eventLink.delete({ where: { id: l.id } }).catch(() => {});
        }
      }
    }
    return NextResponse.json({ from: from.toISOString(), to: to.toISOString(), count: events.length, events });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Parse an ISO string that may be date-only ("2026-03-05") or datetime
// ("2026-03-05T15:00"). Date-only is anchored to local noon so all-day events
// and timezone shifts don't roll it to the previous day.
function parseWhen(v: any): Date | undefined {
  if (!v) return undefined;
  const s = String(v);
  let d = new Date(s);
  if (isNaN(+d)) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  return d;
}

// POST /api/calendar — create an event on the user's Titan calendar (CalDAV PUT).
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const summary = (b.summary || "").trim();
    if (!summary) return NextResponse.json({ error: "summary required" }, { status: 400 });
    const start = parseWhen(b.start);
    if (!start) return NextResponse.json({ error: "invalid start" }, { status: 400 });
    let end = parseWhen(b.end);
    if (!end) end = b.allDay ? new Date(start.getTime() + 86400000) : new Date(start.getTime() + 3600000);
    const { uid } = await createTitanEvent({
      summary,
      start,
      end,
      allDay: !!b.allDay,
      location: b.location ? String(b.location) : undefined,
      description: b.description ? String(b.description) : undefined,
      meetingLink: b.meetingLink ? String(b.meetingLink) : undefined,
      guests: Array.isArray(b.guests) ? b.guests.map(String) : [],
    });
    return NextResponse.json({ uid });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/calendar — edit an existing event by uid. Pass only fields to change.
export async function PATCH(req: NextRequest) {
  try {
    const b = await req.json();
    const uid = (b.uid || "").trim();
    if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });
    const patch: any = {};
    if (b.summary !== undefined) patch.summary = String(b.summary);
    if (b.start !== undefined) {
      const s = parseWhen(b.start);
      if (!s) return NextResponse.json({ error: "invalid start" }, { status: 400 });
      patch.start = s;
    }
    if (b.end !== undefined) {
      const e = parseWhen(b.end);
      if (!e) return NextResponse.json({ error: "invalid end" }, { status: 400 });
      patch.end = e;
    }
    if (b.allDay !== undefined) patch.allDay = !!b.allDay;
    if (b.location !== undefined) patch.location = String(b.location);
    if (b.description !== undefined) patch.description = String(b.description);
    if (b.meetingLink !== undefined) patch.meetingLink = String(b.meetingLink);
    if (Array.isArray(b.guests)) { patch.guests = b.guests.map(String); patch.replaceGuests = b.replaceGuests !== false; }
    if (!Object.keys(patch).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    await updateTitanEvent(uid, patch);
    return NextResponse.json({ uid });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/calendar?uid=… — permanently delete the event from Titan.
export async function DELETE(req: NextRequest) {
  try {
    const uid = new URL(req.url).searchParams.get("uid");
    if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });
    await deleteTitanEvent(uid);
    return NextResponse.json({ uid });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
