import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// TEMP debug route — dumps raw ICS of events in window. DELETE BEFORE SHIP.
export async function GET() {
  const { fetchTitanEvents } = await import("@/lib/titan");
  // reach into internals via a fresh PROPFIND+GET here would duplicate code;
  // instead just return parsed events with full JSON shape to see fields.
  const from = new Date("2025-01-01T00:00:00Z");
  const to = new Date("2027-12-31T23:59:59Z");
  const events = await fetchTitanEvents(from, to);
  return NextResponse.json({ count: events.length, events: JSON.parse(JSON.stringify(events)) });
}
