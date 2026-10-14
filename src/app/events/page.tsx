"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import PageHeader from "@/components/PageHeader";
import EventDrawer from "@/components/EventDrawer";
import EventEditor from "@/components/EventEditor";

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
      {view === "week"
        ? <WeekView {...common} weekDays={weekDays} shiftWeek={shiftWeek} />
        : <MonthGrid {...common} cells={cells} shift={shift} />}
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


