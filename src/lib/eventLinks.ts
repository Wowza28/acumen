// Shared helper: gather Titan events relevant to a contact or project.
//
// Merges two sources (deduped by event UID):
//  1. AUTO: live Titan events whose guest emails include any of the contact's
//     emails, or whose title contains the contact's full name.
//  2. EXPLICIT: local EventLink rows (made via chat or the event drawer's
//     dropdowns), scoped by Titan accountEmail, joined with the live event
//     when it's in the fetched window, or shown from the cached snapshot.
//
// Titan itself is never written to for linking — EventLink rows are the only
// store. Links are staged under the current Titan account email. When a
// different account is configured or none exists, the cached links are
// dormant (not displayed). When accounts reconnect, reconcile() reinstates
// links whose events still exist and drops broken ones.

import { prisma } from "./db";
import { fetchTitanEvents, type TitanEvent, findTitanEventByUid as titanFindByUid } from "./titan";
import { activeAccountEmail } from "./titanAccount";

export type LinkedEvent = TitanEvent & { auto?: boolean; explicit?: boolean };

function eventEmails(e: TitanEvent): string[] {
  const out: string[] = [];
  for (const a of e.attendees || []) {
    if (a.email) out.push(a.email.toLowerCase());
  }
  if (e.organizer) {
    const m = e.organizer.match(/<([^>]+)>/) || e.organizer.match(/([\w.+-]+@[\w-]+\.[\w.]+)/);
    if (m) out.push(m[1].toLowerCase());
  }
  return out;
}

/** All known emails for a contact (default + secondary), lowercased. */
async function contactEmails(contactId: string): Promise<string[]> {
  const c = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { contactEmails: true },
  });
  if (!c) return [];
  const out = new Set<string>();
  if (c.email) out.add(c.email.toLowerCase());
  for (const r of c.contactEmails || []) {
    if (r.value) out.add(String(r.value).toLowerCase());
  }
  return [...out];
}

function matchesContactAuto(e: TitanEvent, name: string, emails: string[]): boolean {
  const guests = eventEmails(e);
  if (emails.some((em) => guests.includes(em))) return true;
  const title = (e.summary || "").toLowerCase();
  const full = (name || "").trim().toLowerCase();
  if (full && full.length >= 3 && title.includes(full)) return true;
  return false;
}

/**
 * Active Titan account email that explicit links belong to. Mapped on
 * creation by toolLinkEvent/event-links POST. Links for a deleted or
 * unconfigured account remain dormant (filtered out) until that account is
 * re-added, at which point reconcile() reinserts them.
 */
export async function activeExplicitAccountEmail(): Promise<string> {
  return activeAccountEmail();
}

/**
 * Reconcile a retained account's EventLink rows against its live calendar:
 * keep links whose event still exists (reinstating them), delete rows whose
 * event no longer exists (broken links). Fetches the live set ONCE.
 */
export async function reconcileEventLinks(accountEmail: string): Promise<{ retained: number; removed: number }> {
  const links = await prisma.eventLink.findMany({
    where: { accountEmail },
    orderBy: { createdAt: "desc" },
  });
  if (!links.length) return { retained: 0, removed: 0 };
  const now = Date.now();
  const from = new Date(now - 400 * 86400000);
  const to = new Date(now + 400 * 86400000);
  let liveUids = new Set<string>();
  try {
    const live = await fetchTitanEvents(from, to);
    liveUids = new Set(live.map((e) => e.uid));
  } catch {
    // Calendar unreachable → leave links untouched (can't tell broken yet).
    return { retained: links.length, removed: 0 };
  }
  let retained = 0;
  let removed = 0;
  for (const l of links) {
    if (liveUids.has(l.eventUid)) retained++;
    else {
      await prisma.eventLink.delete({ where: { id: l.id } });
      removed++;
    }
  }
  return { retained, removed };
}


/** Events for a contact. Links are shown only when the account that owns them
 *  is configured and available; otherwise nothing references that account's
 *  events (live or cached). */
export async function eventsForContact(
  contactId: string,
  from: Date,
  to: Date
): Promise<{ events: LinkedEvent[]; live: boolean }> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return { events: [], live: false };
  const accountEmail = await activeAccountEmail();
  if (!accountEmail) return { events: [], live: false };

  const emails = await contactEmails(contactId);
  let live: TitanEvent[] = [];
  let liveOk = true;
  try {
    live = await fetchTitanEvents(from, to);
  } catch {
    liveOk = false;
  }
  const byUid = new Map<string, LinkedEvent>();
  for (const e of live) {
    if (matchesContactAuto(e, contact.name, emails)) {
      byUid.set(e.uid, { ...e, auto: true });
    }
  }
  const liveUids = new Set(live.map((e) => e.uid));
  const links = await prisma.eventLink.findMany({
    where: { accountEmail, contactId },
    orderBy: { createdAt: "desc" },
  });
  for (const l of links) {
    const hit = live.find((e) => e.uid === l.eventUid);
    if (hit) {
      byUid.set(l.eventUid, { ...hit, auto: (byUid.get(l.eventUid) as any)?.auto, explicit: true });
    } else if (!byUid.has(l.eventUid)) {
      byUid.set(l.eventUid, {
        uid: l.eventUid,
        summary: l.eventTitle || "(event)",
        start: l.eventStart ? new Date(l.eventStart) : undefined,
        end: l.eventEnd ? new Date(l.eventEnd) : undefined,
        explicit: true,
      });
    }
  }
  return { events: [...byUid.values()].sort((a, b) => +new Date(b.start || 0) - +new Date(a.start || 0)), live: liveOk };
}

/** Events linked to a project. Links are gated by the active account, and the
 *  live window reads from that account's calendar. */
export async function eventsForProject(
  projectId: string,
  from: Date,
  to: Date
): Promise<{ events: LinkedEvent[]; live: boolean }> {
  const accountEmail = await activeAccountEmail();
  if (!accountEmail) return { events: [], live: false };
  const links = await prisma.eventLink.findMany({
    where: { accountEmail, projectId },
    orderBy: { createdAt: "desc" },
  });
  let live: TitanEvent[] = [];
  let liveOk = true;
  try {
    live = await fetchTitanEvents(from, to);
  } catch {
    liveOk = false;
  }
  const byUid = new Map<string, LinkedEvent>();
  for (const l of links) {
    const hit = live.find((e) => e.uid === l.eventUid);
    if (hit) byUid.set(l.eventUid, { ...hit, explicit: true });
    else if (!byUid.has(l.eventUid)) {
      byUid.set(l.eventUid, {
        uid: l.eventUid,
        summary: l.eventTitle || "(event)",
        start: l.eventStart ? new Date(l.eventStart) : undefined,
        end: l.eventEnd ? new Date(l.eventEnd) : undefined,
        explicit: true,
      });
    }
  }
  return { events: [...byUid.values()].sort((a, b) => +new Date(b.start || 0) - +new Date(a.start || 0)), live: liveOk };
}


/** Live event lookup for the drawer link dropdowns: find by UID in a wide window. */
export async function findEventWide(uid: string): Promise<TitanEvent | null> {
  const now = new Date();
  const from = new Date(now.getTime() - 365 * 86400000);
  const to = new Date(now.getTime() + 365 * 86400000);
  try {
    const live = await fetchTitanEvents(from, to);
    return live.find((e) => e.uid === uid) || null;
  } catch {
    return null;
  }
}
