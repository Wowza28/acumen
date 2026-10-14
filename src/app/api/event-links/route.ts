import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { activeAccountEmail } from "@/lib/titanAccount";
import { eventsForContact, eventsForProject } from "@/lib/eventLinks";

function windowOf(req: NextRequest): { from: Date; to: Date } {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const from = searchParams.get("from")
    ? new Date(searchParams.get("from")!)
    : new Date(now.getTime() - 90 * 86400000);
  const to = searchParams.get("to")
    ? new Date(searchParams.get("to")!)
    : new Date(now.getTime() + 180 * 86400000);
  return { from: isNaN(+from) ? new Date(now.getTime() - 90 * 86400000) : from, to: isNaN(+to) ? new Date(now.getTime() + 180 * 86400000) : to };
}

// GET /api/event-links?contactId=..  or  ?projectId=..  or  ?eventUid=..
// Returns linked events (with auto/explicit flags), or for eventUid the
// explicit links attached to that event.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contactId");
  const projectId = searchParams.get("projectId");
  const eventUid = searchParams.get("eventUid");
  try {
    if (eventUid) {
      const links = await prisma.eventLink.findMany({
        where: { eventUid },
        include: {
          contact: { select: { id: true, name: true } },
          project: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ links });
    }
    const { from, to } = windowOf(req);
    if (contactId) {
      const { events, live } = await eventsForContact(contactId, from, to);
      return NextResponse.json({ events, live });
    }
    if (projectId) {
      const { events, live } = await eventsForProject(projectId, from, to);
      return NextResponse.json({ events, live });
    }
    return NextResponse.json({ error: "pass contactId, projectId, or eventUid" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/event-links?id=..  — removes one explicit link (never touches Titan).
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "pass id" }, { status: 400 });
    await prisma.eventLink.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


// POST /api/event-links  { eventUid | eventQuery, contactId?, projectId?,
//                          contactName?, projectTitle?, eventTitle?, eventStart?, eventEnd? }
// Creates an explicit link. Resolves names via the CRM resolvers when ids
// aren't given. Looks up the live event for a title/date snapshot when
// possible so rows render even outside the fetched window.
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    let uid: string = (b.eventUid || "").trim();
    const query: string = (b.eventQuery || "").trim();
    let contactId: string | undefined = b.contactId || undefined;
    let projectId: string | undefined = b.projectId || undefined;

    if (contactId) {
      const c = await prisma.contact.findUnique({ where: { id: contactId } });
      if (!c) return NextResponse.json({ error: `No person with id ${contactId}.` }, { status: 404 });
    } else if (b.contactName) {
      const { resolveContact } = await import("@/lib/crm");
      const r = await resolveContact(String(b.contactName));
      if (!r.contact) {
        const cands = r.candidates.map((c: any) => `"${c.name}"`).join(", ");
        return NextResponse.json({ error: cands ? `Ambiguous person "${b.contactName}". Did you mean ${cands}?` : `No person matches "${b.contactName}".` }, { status: 404 });
      }
      contactId = r.contact.id;
    }
    if (projectId) {
      const p = await prisma.project.findUnique({ where: { id: projectId } });
      if (!p) return NextResponse.json({ error: `No project with id ${projectId}.` }, { status: 404 });
    } else if (b.projectTitle) {
      const { resolveProject } = await import("@/lib/crm");
      const r = await resolveProject(String(b.projectTitle));
      if (!r.project) {
        const cands = r.candidates.map((p: any) => `"${p.title}"`).join(", ");
        return NextResponse.json({ error: cands ? `Ambiguous project "${b.projectTitle}". Did you mean ${cands}?` : `No project matches "${b.projectTitle}".` }, { status: 404 });
      }
      projectId = r.project.id;
    }
    if (!contactId && !projectId) {
      return NextResponse.json({ error: "Pass a person (contactId/contactName) or a project (projectId/projectTitle) to link to." }, { status: 400 });
    }

    let title: string = b.eventTitle || "";
    let start: string = b.eventStart || "";
    let end: string = b.eventEnd || "";
    if (!uid && query) {
      const { findTitanEventByUid } = await import("@/lib/titan");
      const found = await findTitanEventByUid(query).catch(() => null);
      if (found) {
        uid = found.event.uid;
        title = title || found.event.summary || "";
        start = start || (found.event.start ? found.event.start.toISOString() : "");
        end = end || (found.event.end ? found.event.end.toISOString() : "");
      }
    }
    if (!uid) return NextResponse.json({ error: "Pass eventUid (or an eventQuery title that matches a Titan event)." }, { status: 400 });
    if (!title || !start) {
      const { findEventWide } = await import("@/lib/eventLinks");
      const live = await findEventWide(uid).catch(() => null);
      if (live) {
        title = title || live.summary || "";
        start = start || (live.start ? live.start.toISOString() : "");
        end = end || (live.end ? live.end.toISOString() : "");
      }
    }

    const accountEmail = await activeAccountEmail();
    const link = await prisma.eventLink.upsert({
      where: { accountEmail_eventUid_contactId_projectId: { accountEmail, eventUid: uid, contactId: contactId || "", projectId: projectId || "" } },
      update: { eventTitle: title, eventStart: start, eventEnd: end },
      create: { eventUid: uid, accountEmail, eventTitle: title, eventStart: start, eventEnd: end, contactId, projectId },
    });
    return NextResponse.json({ link });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
