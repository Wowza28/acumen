"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Shell from "@/components/Shell";
import PageHeader from "@/components/PageHeader";
import { IconMeeting, IconPlus } from "@/components/icons";
import EventDrawer from "@/components/EventDrawer";
import EventEditor from "@/components/EventEditor";

// Inline calendar icon (no IconCalendar exists in the project)
const IconCalendar = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

type Ev = {
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
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Shared hour-column gutter for the week view — used by ALL three grids
// (day headers, all-day row, hour grid) so their columns line up exactly.
const WEEK_GUTTER = 76;

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function timeOf(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// ---- stale-while-revalidate cache for the events feed ----------------------
// Keeps the last fetched batch in sessionStorage so reopening the page paints
// the previous calendar instantly (instead of a blank grid) while the fresh
// batch loads in the background. Keyed by range so a different period never
// shows stale events on the wrong days.
const EVENTS_CACHE_KEY = "events-cache-v1";
function readEventsCache(): { from: string; to: string; events: Ev[] } | null {
  try {
    const raw = sessionStorage.getItem(EVENTS_CACHE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    return j && j.from && j.to && Array.isArray(j.events) ? j : null;
  } catch { return null; }
}
function writeEventsCache(from: string, to: string, events: Ev[]) {
  try { sessionStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify({ from, to, events })); } catch {}
}

export default function EventsPage() {
  const now = new Date();
  const [view, setView] = useState<"month" | "week">("month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [cursor, setCursor] = useState<Date>(now); // anchor day for week view
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true); // start true: hides the "No events" empty-state until the cache/fetch lands
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<Ev | null>(null); // event open in the details drawer
  const [creating, setCreating] = useState<{ date?: Date; hour?: number } | null>(null); // new-event editor prefill

  // Grid: Sunday-on/before the 1st .. Saturday-on/after the last day
  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const startDow = first.getDay();
    const gridStart = new Date(year, month, 1 - startDow);
    const last = new Date(year, month + 1, 0);
    const endDow = last.getDay();
    const gridEnd = new Date(year, month + 1, 0 + (6 - endDow));
    const out: { date: Date; inMonth: boolean }[] = [];
    for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
      out.push({ date: new Date(d), inMonth: d.getMonth() === month });
    }
    return out;
  }, [year, month]);

  // week view: the Sun–Sat span containing `cursor`
  const weekDays = useMemo(() => {
    const start = new Date(cursor); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [cursor]);

  const range = useMemo(() => {
    if (view === "week") {
      const from = weekDays[0];
      const to = new Date(weekDays[6]); to.setHours(23, 59, 59, 999);
      return { from: from.toISOString(), to: to.toISOString() };
    }
    const from = cells.length ? cells[0].date : new Date(year, month, 1);
    const to = cells.length ? new Date(cells[cells.length - 1].date.getTime() + 86400000) : new Date(year, month + 1, 1);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [view, weekDays, cells, year, month]);

  async function load() {
    setLoading(true); setErr("");
    try {
      const j = await fetch(`/api/calendar?from=${range.from}&to=${range.to}`).then((r) => r.json()).catch(() => null);
      if (j?.error) { setErr(j.error); setEvents([]); }
      else {
        const evs = Array.isArray(j?.events) ? j.events : [];
        setEvents(evs);
        writeEventsCache(range.from, range.to, evs);
      }
    } finally { setLoading(false); }
  }
  useEffect(() => {
    // stale-while-revalidate: paint the last refresh for this range instantly
    const cached = readEventsCache();
    if (cached && cached.from === range.from && cached.to === range.to) setEvents(cached.events);
    load(); /* eslint-disable-next-line */
  }, [range.from, range.to]);

  // Settings → "Refresh calendar": drop the cache and refetch live from Titan.
  useEffect(() => {
    const h = () => load();
    window.addEventListener("acumen:refresh-calendar", h);
    return () => window.removeEventListener("acumen:refresh-calendar", h);
    /* eslint-disable-next-line */
  }, []);

  // Open week view by default on mobile
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) setView("week");
  }, []);

  // Ensure the page itself is scrolled to the top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // group events by local day
  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of events) {
      if (!e.start) continue;
      const k = dayKey(new Date(e.start));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    for (const arr of Array.from(m.values())) arr.sort((a, b) => ((a.start || "") < (b.start || "") ? -1 : 1));
    return m;
  }, [events]);

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear()); setMonth(d.getMonth()); setCursor(d);
  }
  function shiftWeek(delta: number) {
    const d = new Date(cursor); d.setDate(d.getDate() + delta * 7);
    setCursor(d); setYear(d.getFullYear()); setMonth(d.getMonth());
  }
  const years = useMemo(() => {
    const y = now.getFullYear();
    return Array.from({ length: 11 }, (_, i) => y - 5 + i);
  }, []);

  const common = { year, month, setMonth, setYear, years, load, loading, err, byDay, todayKey: dayKey(now), view, setView, onSelect: setSel, onCreateAt: (date: Date, hour: number) => setCreating({ date, hour }) };
  return (
    <>
      {/* Desktop: existing week/month grid views (unchanged) */}
      <div className="md:block hidden">
        {view === "week"
          ? <WeekView {...common} weekDays={weekDays} shiftWeek={shiftWeek} />
          : <MonthGrid {...common} cells={cells} shift={shift} />}
      </div>

      {/* Mobile: Titan-style vertical month list */}
      <div className="md:hidden">
        <MobileEventsView
          events={events}
          byDay={byDay}
          todayKey={dayKey(now)}
          onSelect={setSel}
          onCreateAt={(date: Date, hour: number) => setCreating({ date, hour })}
          load={load}
          loading={loading}
          err={err}
        />
      </div>

      {sel && <EventDrawer ev={sel} onClose={() => setSel(null)} onChanged={load} />}
      {creating && <EventEditor prefill={creating} onClose={() => setCreating(null)} onSaved={() => { setCreating(null); load(); }} />}
    </>
  );
}

function ViewToggle({ view, setView }: { view: string; setView: (v: "month" | "week") => void }) {
  return (
    <div className="flex rounded-lg border border-slate-200 dark:border-zinc-700 overflow-hidden text-[13px]">
      {(["month", "week"] as const).map((v) => (
        <button key={v} onClick={() => setView(v)}
          className={`px-3.5 py-1.5 capitalize font-medium ${view === v ? "bg-brand-500 text-white" : "text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"}`}>
          {v}
        </button>
      ))}
    </div>
  );
}

function MonthGrid(p: any) {
  const { month, setMonth, year, setYear, shift, years, load, loading, err, cells, byDay, todayKey, view, setView, onSelect } = p;
  return (
    <Shell wide>
      <PageHeader icon="meetings" title="Events" right={
        <div className="flex items-center gap-2">
          <button className="icon-btn" title="Previous month" onClick={() => shift(-1)}>‹</button>
          <select className="input !py-1 !w-auto" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select className="input !py-1 !w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y: number) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="icon-btn" title="Next month" onClick={() => shift(1)}>›</button>
          <ViewToggle view={view} setView={setView} />
          <button className="btn-ghost text-sm" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
        </div>
      } />

      {err && <div className="card mb-3 text-sm text-red-500">{err}</div>}

      <div className="card !p-0 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-zinc-800">
          {DOW.map((d) => (
            <div key={d} className="px-3 py-2.5 text-[13px] font-medium text-slate-500 dark:text-zinc-400 text-center border-r border-slate-100 dark:border-zinc-800 last:border-r-0">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map(({ date, inMonth }: any, i: number) => {
            const k = dayKey(date);
            const dayEvents = byDay.get(k) || [];
            const isToday = k === todayKey;
            return (
              <div key={i}
                className={`min-h-[140px] border-r border-b border-slate-100 dark:border-zinc-800 p-2 flex flex-col gap-1.5 ${inMonth ? "" : "bg-slate-50/60 dark:bg-zinc-900/40"}`}>
                <span className={`text-[15px] font-medium w-8 h-8 flex items-center justify-center rounded-full ${isToday ? "bg-brand-500 text-white" : inMonth ? "text-slate-700 dark:text-zinc-200" : "text-slate-300 dark:text-zinc-600"}`}>
                  {date.getDate()}
                </span>
                <div className="flex flex-col gap-1 overflow-hidden">
                  {dayEvents.map((e: Ev) => (
                    <div key={e.uid}
                      onClick={() => onSelect?.(e)}
                      title={`${e.summary || ""}${e.location ? " · " + e.location : ""}`}
                      className="text-[13px] leading-tight rounded px-2 py-1 bg-brand-500/10 text-brand-700 dark:text-brand-300 border-l-2 border-brand-500 truncate cursor-pointer hover:bg-brand-500/20">
                      <div className="font-medium truncate">{e.summary || "(no title)"}</div>
                      {!e.allDay && e.start && <div className="text-slate-500 dark:text-zinc-400 text-[12px]">{timeOf(e.start)}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!loading && !err && !cells.some((c: any) => (byDay.get(dayKey(c.date)) || []).length) && (
        <div className="text-sm text-slate-400 mt-3">No events this month. Events come from your Titan calendar (CalDAV).</div>
      )}
    </Shell>
  );
}

function WeekView(p: any) {
  const { years, load, loading, err, byDay, todayKey, view, setView, weekDays, shiftWeek, onSelect, onCreateAt } = p;
  const HOUR_H = 60;
  const dayH = 24 * HOUR_H;
  const label = `${weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
  const anyEvents = weekDays.some((d: Date) => (byDay.get(dayKey(d)) || []).length);
  return (
    <Shell wide>
      <PageHeader icon="meetings" title="Events" right={
        <div className="flex items-center gap-2">
          <button className="icon-btn" title="Previous week" onClick={() => shiftWeek(-1)}>‹</button>
          <span className="text-sm text-slate-500 dark:text-zinc-400 whitespace-nowrap">{label}</span>
          <button className="icon-btn" title="Next week" onClick={() => shiftWeek(1)}>›</button>
          <ViewToggle view={view} setView={setView} />
          <button className="btn-ghost text-sm" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
        </div>
      } />
      {err && <div className="card mb-3 text-sm text-red-500">{err}</div>}
      <div className="card !p-0 overflow-hidden">
        {/* One scroll area for headers + all-day + hours: all three grids then
            share identical track widths (scrollbar included), so columns align. */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(70vh + 7rem)" }}>
          {/* day headers + all-day row stay pinned while hours scroll under them */}
          <div className="sticky top-0 z-10 bg-white dark:bg-zinc-900">
            {/* day headers */}
            <div className="grid border-b border-slate-200 dark:border-zinc-800" style={{ gridTemplateColumns: `${WEEK_GUTTER}px repeat(7,1fr)` }}>
              <div className="border-r border-slate-100 dark:border-zinc-800" />
              {weekDays.map((d: Date) => {
                const isToday = dayKey(d) === todayKey;
                return (
                  <div key={dayKey(d)} className="px-2 py-2 text-center border-r border-slate-100 dark:border-zinc-800 last:border-r-0">
                    <div className="text-[13px] text-slate-500 dark:text-zinc-400 font-medium">{DOW[d.getDay()]}</div>
                    <div className={`text-lg font-medium w-9 h-9 mx-auto flex items-center justify-center rounded-full ${isToday ? "bg-brand-500 text-white" : ""}`}>{d.getDate()}</div>
                  </div>
                );
              })}
            </div>
            <AllDayRow weekDays={weekDays} byDay={byDay} onSelect={onSelect} gutter={WEEK_GUTTER} />
          </div>
          {/* timed grid */}
          <div className="grid" style={{ gridTemplateColumns: `${WEEK_GUTTER}px repeat(7,1fr)` }}>
            <div className="relative border-r border-slate-100 dark:border-zinc-800" style={{ height: dayH }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="absolute right-1.5 text-xs text-slate-400" style={{ top: h * HOUR_H, transform: h === 0 ? undefined : "translateY(-50%)" }}>{hourLabel(h)}</div>
              ))}
            </div>
            {weekDays.map((d: Date, di: number) => {
              const evs = (byDay.get(dayKey(d)) || []).filter((e: Ev) => !e.allDay && e.start);
              return (
                <div key={di} className="relative border-r border-slate-100 dark:border-zinc-800 last:border-r-0 cursor-pointer" style={{ height: dayH }}
                  onClick={(ce) => {
                    // Google-Calendar-style: clicking empty grid space opens a new
                    // event at the clicked day + hour (snapped to the click's Y).
                    const rect = (ce.currentTarget as HTMLElement).getBoundingClientRect();
                    const y = ce.clientY - rect.top;
                    const hour = Math.max(0, Math.min(23, Math.floor(y / HOUR_H)));
                    onCreateAt?.(d, hour);
                  }}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="absolute left-0 right-0 border-t border-slate-100 dark:border-zinc-800" style={{ top: h * HOUR_H }} />
                  ))}
                  {evs.map((e: Ev) => {
                    const s = new Date(e.start!); const en = e.end ? new Date(e.end) : new Date(s.getTime() + 3600000);
                    const top = ((s.getHours() * 60 + s.getMinutes()) / 60) * HOUR_H;
                    const hgt = Math.max(((en.getTime() - s.getTime()) / 60000 / 60) * HOUR_H, 20);
                    return (
                      <div key={e.uid} title={`${e.summary || ""}${e.location ? " · " + e.location : ""}`}
                        onClick={(ce) => { ce.stopPropagation(); onSelect?.(e); }}
                        className="absolute left-1 right-1 rounded px-2 py-1 bg-brand-500/15 text-brand-700 dark:text-brand-300 border-l-2 border-brand-500 overflow-hidden text-[13px] cursor-pointer hover:bg-brand-500/25"
                        style={{ top, height: hgt }}>
                        <div className="font-medium truncate">{e.summary || "(no title)"}</div>
                        {hgt > 40 && <div className="text-slate-500 dark:text-zinc-400 text-[12px] truncate">{timeOf(e.start)}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {!loading && !err && !anyEvents && <div className="text-sm text-slate-400 mt-3">No events this week.</div>}
    </Shell>
  );
}

function AllDayRow({ weekDays, byDay, onSelect, gutter = WEEK_GUTTER }: { weekDays: Date[]; byDay: Map<string, Ev[]>; onSelect?: (e: Ev) => void; gutter?: number }) {
  return (
    <div className="grid border-b border-slate-100 dark:border-zinc-800" style={{ gridTemplateColumns: `${gutter}px repeat(7,1fr)` }}>
      <div className="border-r border-slate-100 dark:border-zinc-800 text-xs text-slate-400 px-1 py-1.5">all-day</div>
      {weekDays.map((d: Date, i) => {
        const evs = (byDay.get(dayKey(d)) || []).filter((e) => e.allDay);
        return (
          <div key={i} className="border-r border-slate-100 dark:border-zinc-800 last:border-r-0 p-0.5 flex flex-col gap-0.5 min-h-[30px]">
            {evs.map((e) => (
              <div key={e.uid} title={e.summary} onClick={() => onSelect?.(e)}
                className="text-[13px] truncate rounded px-1.5 py-0.5 bg-brand-500/15 text-brand-700 dark:text-brand-300 border-l-2 border-brand-500 cursor-pointer hover:bg-brand-500/25">{e.summary || "(no title)"}</div>
            ))}
          </div>
        );
      })}
    </div>
  );
}



// ============================================================================
// Mobile-only: Titan-style vertical month list calendar
// ============================================================================

function MobileEventsView({ events, byDay, todayKey, onSelect, onCreateAt, load, loading, err }: any) {
  const now = new Date();
  const todayStr = todayKey;

  // Center month state - the list shows 25 months from 1 year ago to 1 year ahead,
  // with the current month scrolled to the top on load
  const [centerYear, setCenterYear] = useState(now.getFullYear());
  const [centerMonth, setCenterMonth] = useState(now.getMonth());

  // Mini calendar state
  const [miniOpen, setMiniOpen] = useState(false);
  const [miniYear, setMiniYear] = useState(now.getFullYear());
  const [miniMonth, setMiniMonth] = useState(now.getMonth());

  // Scroll ref for the center month section
  const currentMonthRef = useRef<HTMLDivElement>(null);
  // Scroll ref for the panel itself (so we can scroll ONLY it, not the page)
  const panelRef = useRef<HTMLDivElement>(null);

  // Scroll only the panel to the center month; keep the page at the top.
  // (scrollIntoView would scroll ALL ancestors including the page.)
  const scrollPanelToCenter = useCallback(() => {
    window.scrollTo(0, 0);
    const section = currentMonthRef.current;
    const panel = panelRef.current;
    if (!section || !panel) return;
    const top = section.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
    panel.scrollTop = Math.max(0, top - 8); // scroll-mt-2 ≈ 8px gap
  }, []);

  // Group events by month key (YYYY-MM)
  const eventsByMonth = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of events) {
      if (!e.start) continue;
      const d = new Date(e.start);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    }
    return m;
  }, [events]);

  // Build 25 month sections: from centerMonth - 12 to centerMonth + 12
  const sections = useMemo(() => {
    const out: Array<{ y: number; m: number; label: string; range: string; events: Ev[] }> = [];
    let total = centerYear * 12 + centerMonth - 12;
    let y = Math.floor(total / 12);
    let m = total % 12;
    if (m < 0) { m += 12; y -= 1; }
    for (let i = 0; i < 25; i++) {
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      out.push({
        y, m,
        label: first.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        range: `${first.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })} – ${last.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}`,
        events: eventsByMonth.get(key) || [],
      });
      total++;
      y = Math.floor(total / 12);
      m = total % 12;
      if (m < 0) { m += 12; y -= 1; }
    }
    return out;
  }, [centerYear, centerMonth, eventsByMonth]);

  // Scroll center month to top on mount and whenever center changes
  useEffect(() => {
    scrollPanelToCenter();
  }, [centerYear, centerMonth, scrollPanelToCenter]);

  const miniDaysInMonth = new Date(miniYear, miniMonth + 1, 0).getDate();
  const miniFirstDow = new Date(miniYear, miniMonth, 1).getDay();
  const miniMonthLabel = new Date(miniYear, miniMonth, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const resetToToday = () => {
    setCenterYear(now.getFullYear());
    setCenterMonth(now.getMonth());
    setMiniYear(now.getFullYear());
    setMiniMonth(now.getMonth());
    setMiniOpen(false);
    // Direct scroll in case centerYear/centerMonth didn't change (effect won't fire)
    scrollPanelToCenter();
  };

  return (
    <Shell wide>
      {/* Sticky header pinned to top - full width background, single line */}
      <div className="sticky top-0 z-40 bg-zinc-900 rounded-[1rem]">
        <div className="flex items-center justify-between gap-2 px-4 py-2">
          <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2 min-w-0">
            <span className="text-brand-500 dark:text-brand-400 shrink-0"><IconMeeting /></span>
            <span className="truncate">Events</span>
          </h1>
          <div className="flex items-center gap-1">
            <button className="icon-btn" title="Select month" onClick={() => { setMiniYear(centerYear); setMiniMonth(centerMonth); setMiniOpen(true); }}>
              <IconCalendar className="w-5 h-5" />
            </button>
            <button className="icon-btn" title="Reset to today" onClick={resetToToday}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button className="icon-btn" title="New event" onClick={() => onCreateAt(now, now.getHours())}>
              <IconPlus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Error (e.g. no Titan account) shows as a banner ABOVE the calendar —
          the header, hamburger, month list and all buttons stay interactive. */}
      {err && <div className="mt-2 card text-sm text-red-500">{err}</div>}

      {/* Scrollable month panel - fills remaining screen height */}
      <div ref={panelRef} className="h-[calc(100vh-112px)] overflow-y-auto overflow-x-hidden">
        <div className="space-y-6 pb-20">
          {sections.map((section) => {
            const isCurrentMonth = section.y === now.getFullYear() && section.m === now.getMonth();
            const daysWithEvents = new Set<string>();
            section.events.forEach((e) => {
              if (e.start) {
                const d = new Date(e.start);
                daysWithEvents.add(dayKey(d));
              }
            });

            const daysToShow = Array.from(daysWithEvents);
            if (isCurrentMonth && !daysWithEvents.has(todayStr)) {
              daysToShow.push(todayStr);
            }
            daysToShow.sort();

            const eventsByDay = new Map<string, Ev[]>();
            section.events.forEach((e) => {
              if (e.start) {
                const k = dayKey(new Date(e.start));
                if (!eventsByDay.has(k)) eventsByDay.set(k, []);
                eventsByDay.get(k)!.push(e);
              }
            });

            // Attach ref to center month section for scroll
            const sectionRef =
              section.y === centerYear && section.m === centerMonth
                ? currentMonthRef
                : undefined;

            if (daysToShow.length === 0 && !isCurrentMonth) {
              return (
                <div key={`${section.y}-${section.m}`} className="px-4 scroll-mt-2" ref={sectionRef}>
                  <div className="text-xl font-semibold text-slate-200 mb-1">{section.label}</div>
                  <div className="text-sm text-slate-400 mb-3">{section.range}</div>
                  <div
                    className="card p-4 text-slate-400 text-sm text-center cursor-pointer"
                    onClick={() => onCreateAt(new Date(section.y, section.m, 1), 9)}
                  >
                    No events. Tap to create.
                  </div>
                </div>
              );
            }

            return (
              <div key={`${section.y}-${section.m}`} className="px-4 scroll-mt-2" ref={sectionRef}>
                <div className="text-xl font-semibold text-slate-200 mb-1">{section.label}</div>
                <div className="text-sm text-slate-400 mb-3">{section.range}</div>
                <div className="space-y-2">
                  {daysToShow.map((dayKeyStr) => {
                    const dayEvents = eventsByDay.get(dayKeyStr) || [];
                    const isToday = dayKeyStr === todayStr;
                    const dayDate = new Date(dayKeyStr);
                    const dow = dayDate.toLocaleDateString(undefined, { weekday: "short" });

                    return (
                      <div
                        key={dayKeyStr}
                        className="card cursor-pointer"
                        onClick={() => {
                          if (dayEvents.length === 0) onCreateAt(dayDate, dayDate.getHours());
                        }}
                      >
                        <div className="flex items-start gap-3">
                          {/* Date on left */}
                          <div className={`flex-shrink-0 flex flex-col items-center gap-0.5 ${isToday ? "text-brand-500" : "text-slate-400"}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${isToday ? "bg-brand-500 text-white" : "text-slate-600 dark:text-zinc-400"}`}>
                              {dayDate.getDate()}
                            </div>
                            <div className="text-[10px]">{dow}</div>
                          </div>

                          {/* Event content on right */}
                          <div className="flex-1">
                            {dayEvents.length > 0 ? (
                              dayEvents.map((e, ei) => (
                                <div
                                  key={e.uid}
                                  onClick={(ev) => { ev.stopPropagation(); onSelect?.(e); }}
                                  className="rounded-lg px-3 py-2 bg-brand-500/15 text-brand-700 dark:text-brand-300 border-l-2 border-brand-500 cursor-pointer hover:bg-brand-500/25"
                                >
                                  <div className="font-medium text-sm truncate">{e.summary || "(no title)"}</div>
                                  {!e.allDay && e.start && (
                                    <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">{timeOf(e.start)}</div>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div
                                className="p-3 text-slate-400 text-sm text-center cursor-pointer"
                                onClick={(ev) => { ev.stopPropagation(); onCreateAt(dayDate, dayDate.getHours()); }}
                              >
                                Nothing planned. Tap to create.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mini month calendar floating panel */}
      {miniOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setMiniOpen(false)}>
          <div className="absolute inset-y-0 left-0 w-full md:w-80 bg-zinc-900 border-r border-zinc-800 p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <button className="icon-btn" onClick={() => {
                const newM = miniMonth === 0 ? 11 : miniMonth - 1;
                const newY = newM === 11 ? miniYear - 1 : miniYear;
                setMiniYear(newY);
                setMiniMonth(newM);
              }}>‹</button>
              <span className="font-medium">{miniMonthLabel}</span>
              <button className="icon-btn" onClick={() => {
                const newM = miniMonth === 11 ? 0 : miniMonth + 1;
                const newY = newM === 0 ? miniYear + 1 : miniYear;
                setMiniYear(newY);
                setMiniMonth(newM);
              }}>›</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-[10px] text-slate-400 font-medium mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                <div key={d} className="text-center">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {/* Leading blanks */}
              {Array.from({ length: miniFirstDow }).map((_, i) => (
                <div key={i} className="h-8" />
              ))}
              {/* Days */}
              {Array.from({ length: miniDaysInMonth }, (_, i) => {
                const d = i + 1;
                const date = new Date(miniYear, miniMonth, d);
                const isToday = dayKey(date) === todayStr;
                return (
                  <button
                    key={d}
                    onClick={() => {
                      setCenterYear(date.getFullYear());
                      setCenterMonth(date.getMonth());
                      setMiniOpen(false);
                    }}
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-sm ${isToday ? "bg-brand-500 text-white" : ""}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <div className="mt-4">
              <button className="w-full btn-ghost text-sm" onClick={() => setMiniOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
