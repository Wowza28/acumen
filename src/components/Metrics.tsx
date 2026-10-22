"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { money, dateLabel } from "@/lib/ui";
import { parseTransactionTags, transactionTagClasses } from "@/components/TransactionTags";
import { VAT_RATE, type VatExclusionRule } from "@/components/AccountsGraph";

type DisplayCurrency = "AED" | "USD";
type PeriodKind = "inception" | "year" | "month";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COST_TAGS = ["Expense", "Fees", "Food", "Fuel", "Parking"];

function toDisplay(amount: number, currency: string, display: DisplayCurrency, rate: number): number {
  if (currency === display) return amount;
  if (currency === "USD" && display === "AED") return amount * rate;
  if (currency === "AED" && display === "USD") return amount / rate;
  return amount;
}

/** Compact axis value: "12.5K" / "-1.3M" / "420" (no currency prefix). */
function axisMoney(v: number) {
  const a = Math.abs(v);
  const s = a >= 1e6 ? (a / 1e6).toFixed(1) + "M" : a >= 1e3 ? (a / 1e3).toFixed(1) + "K" : a.toFixed(0);
  return (v < 0 ? "-" : "") + s;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function describeArc(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polarToCartesian(cx, cy, r, start);
  const e = polarToCartesian(cx, cy, r, end);
  // sweep=1: segments advance clockwise (increasing angle) on screen; sweep=0
  // would put each arc on the mirror circle through the same points (contorted donut).
  const large = end - start <= 180 ? 0 : 1;
  return ["M", s.x, s.y, "A", r, r, 0, large, 1, e.x, e.y].join(" ");
}
const TAG_COLOURS = ["#10b981", "#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#ef4444", "#6366f1", "#a855f7", "#0ea5e9", "#84cc16"];

/** Reactive ≤767px flag (same pattern as AccountsGraph's narrow screen). */
function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

/** Touch-pointer flag (drives mobile tap selection, same as the Summary graph). */
function useCoarse() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const pq = window.matchMedia("(pointer: coarse)");
    const on = () => setCoarse(pq.matches);
    on();
    pq.addEventListener("change", on);
    return () => pq.removeEventListener("change", on);
  }, []);
  return coarse;
}

/** Eases a number toward its new target (period/currency switches) so money
 *  displays roll instead of jumping. Mount shows the value as-is. */
function useCountUp(target: number, ms = 550) {
  const [val, setVal] = useState(target);
  const valRef = useRef(target);
  useEffect(() => {
    const from = valRef.current;
    if (Math.abs(from - target) < 1e-9) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      const v = from + (target - from) * e;
      valRef.current = v;
      setVal(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

interface TagStat { tag: string; total: number; count: number; }
interface Bucket { key: string; label: string; net: number; }

function StatCard({ label, amount, currency, sub, color = "text-slate-600 dark:text-zinc-400" }: { label: string; amount: number; currency: DisplayCurrency; sub?: string; color?: string }) {
  const shown = useCountUp(amount);
  return (
    <div className="card p-3">
      <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-zinc-500 mb-1">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{money(shown, currency)}</div>
      {sub && <div className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}


function TagDonut({ tagStats, display, className = "" }: { tagStats: TagStat[]; display: DisplayCurrency; className?: string }) {
  const total = tagStats.reduce((s, t) => s + t.total, 0);
  const shownTotal = useCountUp(total);
  const cx = 110, cy = 110, rOuter = 84, rInner = 62;
  const ringIn = rOuter - 12, ringOut = rOuter + 12; // 24-wide stroke spans 72..96
  let start = 0;
  const arcs = tagStats.map((t, i) => {
    const sweep = total > 0 ? (t.total / total) * 360 : 0;
    const end = start + sweep;
    const d = describeArc(cx, cy, rOuter, start, end);
    const from = start;
    start = end;
    return { d, from, tag: t.tag, total: t.total, colour: t.tag === "Untagged" ? "#94a3b8" : TAG_COLOURS[i % TAG_COLOURS.length], pct: total > 0 ? (t.total / total) * 100 : 0, sweep };
  });
  // A single 100% segment (start == end) would draw nothing as an arc — use a circle.
  const singleFull = arcs.length === 1 && arcs[0].sweep >= 359.9;
  // Data signature: re-keys the svg/legend (NOT the card) so the donut
  // crossfades in place on period/currency switches while the card persists
  // and the centre total rolls via useCountUp.
  const sig = `${display}|${tagStats.map((t) => `${t.tag}:${t.total.toFixed(2)}`).join(",")}`;
  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold">Tag Breakdown</h2>
        <p className="text-xs text-slate-500 dark:text-zinc-500">in {display}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 max-md:justify-center">
        {/* shrink-0 keeps the box square — flex would otherwise squeeze the
            width and turn the donut into an ellipse. */}
        <svg key={`d-${sig}`} viewBox="0 0 220 220" className="w-36 h-36 max-md:w-72 max-md:h-72 sm:w-48 sm:h-48 xl:w-64 xl:h-64 shrink-0 metrics-fade" role="img" aria-label="Tag breakdown donut">
          {singleFull ? (
            <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke={arcs[0].colour} strokeWidth={24} />
          ) : arcs.map((a, i) => (
            <path key={i} d={a.d} fill="none" stroke={a.colour} strokeWidth={24} strokeLinecap="butt" />
          ))}
          {/* Excel-style radial dividers: card-coloured spokes at every boundary. */}
          {!singleFull && arcs.map((a, i) => {
            const p1 = polarToCartesian(cx, cy, ringIn - 2, a.from);
            const p2 = polarToCartesian(cx, cy, ringOut + 2, a.from);
            return <line key={`d${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} strokeWidth={2.5} className="stroke-white dark:stroke-zinc-900" />;
          })}
          <circle cx={cx} cy={cy} r={rInner} fill="none" stroke="currentColor" strokeWidth={1} opacity={0.15} />
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize={16} className="font-semibold fill-slate-600 dark:fill-zinc-300">{axisMoney(shownTotal)}</text>
          <text x={cx} y={cy + 16} textAnchor="middle" fontSize={11} className="fill-slate-400 dark:fill-zinc-500">total</text>
        </svg>
        {/* Compact legend: one row per tag (dot · name · amount · %). */}
        <div key={`l-${sig}`} className="min-w-[240px] flex-1 max-w-[300px] space-y-1 metrics-fade">
          {arcs.map((a) => (
            <div key={a.tag} className="flex items-center gap-2 text-xs leading-tight">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: a.colour }} />
              <span className="truncate flex-1 min-w-0">{a.tag}</span>
              <span className="shrink-0 tabular-nums">{money(a.total, "")}</span>
              <span className="shrink-0 w-7 text-right text-[10px] text-slate-400 dark:text-zinc-500">{a.pct.toFixed(0)}%</span>
            </div>
          ))}
          {tagStats.length === 0 && <div className="text-xs text-slate-400 dark:text-zinc-500">No tagged transactions in this period.</div>}
        </div>
      </div>
    </div>
  );
}

/** Net Flows: diverging bars (inflow − outflow) with hover tooltips. Narrower,
 *  taller 780×250 desktop canvas (capped at 780 rendered px); a 480×190 geometry
 *  on ≤767px keeps fonts and bar spacing readable on phones. */
function NetFlows({ buckets, display, gran, withYear, className = "" }: { buckets: Bucket[]; display: DisplayCurrency; gran: "day" | "month"; withYear: boolean; className?: string }) {
  const narrow = useNarrow();
  const [hover, setHover] = useState<number | null>(null);
  // Mobile tap selection (mirrors the Summary graph): coarse pointers toggle
  // a full-size detail card below the plot instead of following the mouse.
  const coarse = useCoarse();
  const detailRef = useRef<HTMLDivElement>(null);
  // Touch drag state (mirrors the Summary graph): pointerdown selects the bar
  // under the finger, pointermove updates live while down, and the click
  // handler tells a tap (toggle/dismiss) apart from a drag (keep drop point).
  const gestureRef = useRef<{ down: boolean; idx: number | null; pre: number | null; moved: boolean }>({ down: false, idx: null, pre: null, moved: false });
  const n = buckets.length;
  const W = narrow ? 480 : 780, H = narrow ? 190 : 250;
  const PL = 56, PR = 14, PT = 14, PB = narrow ? 34 : 36;
  const plotW = W - PL - PR, plotH = H - PT - PB;
  const maxAbs = Math.max(1, ...buckets.map((b) => Math.abs(b.net)));
  const midY = PT + plotH / 2;
  const scale = plotH / 2 / maxAbs;
  const slotW = plotW / Math.max(n, 1);
  const barW = Math.max(3, Math.min(slotW * 0.62, 30));
  // Flat label widths at desktop font 16 (incl. gap) → thin to as many as fit.
  // Mobile-only: axis text matches the Financials/Summary graphs (same
  // rendered size and colour), which on this narrower canvas means smaller
  // viewBox fonts — so the thinning estimate scales down too.
  const effW = (gran === "day" ? 26 : withYear ? 70 : 34) * (narrow ? 12 / 16 : 1);
  const step = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / effW))));
  // Hover tooltip for the slot under the cursor.
  const hov = hover !== null && hover >= 0 && hover < n ? buckets[hover] : null;
  const tipW = 170, tipH = 50;
  const tipX = hover !== null ? Math.min(Math.max(PL + slotW * (hover + 0.5) - tipW / 2, PL), Math.max(PL, W - PR - tipW)) : 0;
  const tipY = PT + 6;
  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold">Net Flows</h2>
        <p className="text-xs text-slate-500 dark:text-zinc-500">{gran === "day" ? "Daily" : "Monthly"} · {display}</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-w-[780px] mx-auto" role="img" aria-label={`Net flows by ${gran}`} onMouseLeave={() => { if (!coarse) setHover(null); }}
        style={coarse ? { touchAction: "pan-y" } : undefined}
        onPointerDown={(e) => {
          if (!coarse) return;
          const bb = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const vx = ((e.clientX - bb.left) / bb.width) * W;
          const i = Math.floor((vx - PL) / slotW);
          const idx = i >= 0 && i < n ? i : null;
          gestureRef.current = { down: true, idx, pre: hover, moved: false };
          setHover(idx);
          if (idx !== null) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
        }}
        onPointerMove={(e) => {
          const g = gestureRef.current;
          if (!coarse || !g.down) return;
          const bb = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const vx = ((e.clientX - bb.left) / bb.width) * W;
          const i = Math.floor((vx - PL) / slotW);
          if (i !== g.idx) g.moved = true;
          if (i >= 0 && i < n) setHover(i);
        }}
        onPointerUp={() => { gestureRef.current.down = false; }}
        onPointerCancel={() => { gestureRef.current.down = false; }}
        onClick={() => {
          if (!coarse) return;
          const g = gestureRef.current;
          // Drags already left the selection at the drop point — keep it.
          // Taps on the already-selected bar dismiss it (toggle).
          if (!g.moved && g.idx !== null && g.pre === g.idx) setHover(null);
        }}
      >
        {[1, 0.5, 0, -0.5, -1].map((f) => {
          const y = midY - f * maxAbs * scale;
          return (
            <g key={f}>
              <line x1={PL} x2={W - PR} y1={y} y2={y} strokeWidth={1}
                className={f === 0 ? "stroke-slate-300 dark:stroke-zinc-700" : "stroke-slate-200/60 dark:stroke-zinc-800/60"}
                strokeDasharray={f === 0 ? "4 3" : undefined} />
              {/* Mobile-only: match the Financials/Summary axis look — this canvas is
                  narrower (480px), so smaller viewBox fonts (10/12) render at
                  the same size, and slate-400/zinc-500 for the same colour. */}
              <text x={PL - 8} y={y + 4} textAnchor="end" fontSize={narrow ? 10 : 12} className={narrow ? "fill-slate-400 dark:fill-zinc-500" : "fill-slate-500 dark:fill-zinc-400"}>{axisMoney(maxAbs * f)}</text>
            </g>
          );
        })}
        {buckets.map((b, i) => {
          const cx = PL + slotW * (i + 0.5);
          const h = b.net * scale;
          const y = h >= 0 ? midY - h : midY;
          const on = hover === i;
          const base = b.net >= 0
            ? on ? "fill-emerald-600 dark:fill-emerald-500" : "fill-emerald-500/85 dark:fill-emerald-400/80"
            : on ? "fill-rose-600 dark:fill-rose-500" : "fill-rose-500/85 dark:fill-rose-400/80";
          return (
            <rect key={b.key} x={cx - barW / 2} y={y} width={barW} height={Math.max(1.5, Math.abs(h))} rx={2}
              className={base + " metrics-bar"}
              style={{ transformOrigin: b.net >= 0 ? "50% 100%" : "50% 0%", animationDelay: `${Math.min(i * 30, 450)}ms` }} />
          );
        })}
        {buckets.map((b, i) => {
          if (i % step !== 0 && i !== n - 1) return null;
          const cx = PL + slotW * (i + 0.5);
          return (
            <text key={b.key} x={cx} y={H - PB + 18} textAnchor="middle" fontSize={narrow ? 12 : 14} className={narrow ? "fill-slate-400 dark:fill-zinc-500" : "fill-slate-500 dark:fill-zinc-400"}>{b.label}</text>
          );
        })}
        {/* Full-slot hit areas: hovering anywhere in a column shows its value. */}
        {buckets.map((b, i) => {
          const cx = PL + slotW * (i + 0.5);
          return (
            <rect key={`hit-${b.key}`} x={cx - slotW / 2} y={PT} width={slotW} height={plotH}
              fill="transparent"
              onMouseEnter={coarse ? undefined : () => setHover(i)}
              style={{ cursor: coarse ? "pointer" : undefined }} />
          );
        })}
        {hov && (
          <g pointerEvents="none" className="max-md:hidden">
            <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={8} strokeWidth={1}
              className="fill-white stroke-slate-300 dark:fill-zinc-900 dark:stroke-zinc-600" />
            <text x={tipX + tipW / 2} y={tipY + 19} textAnchor="middle" fontSize={13}
              className="fill-slate-500 dark:fill-zinc-400">{hov.label}</text>
            <text x={tipX + tipW / 2} y={tipY + 41} textAnchor="middle" fontSize={15} fontWeight={600}
              className={hov.net >= 0 ? "fill-emerald-600 dark:fill-emerald-400" : "fill-rose-600 dark:fill-rose-400"}>
              {money(hov.net, display)}
            </text>
          </g>
        )}
      </svg>
      {/* Mobile detail card (below the graph, inside the card) — mirrors the
          Summary graph. The in-SVG tooltip stays PC-only (max-md:hidden). */}
      {hov && (
        <div ref={detailRef} className="md:hidden mt-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-3 py-2.5">
          <div className="text-sm font-semibold">{hov.label}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <span className="text-slate-500 dark:text-zinc-400">Net</span>
            <span className={`text-right font-semibold ${hov.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{money(hov.net, display)}</span>
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400 dark:text-zinc-500">
        Bars show each {gran === "day" ? "day's" : "month's"} inflow minus outflow.
      </p>
    </div>
  );
}

interface FinMonth { key: string; label: string; title: string; rev: number; cost: number; net: number; avg: number; }

/** Financials: screen-wide monthly view — Revenue/Costs/Net Profit bars plus a
 *  running-average Net Profit line (dashed purple). Always monthly granularity:
 *  inception shows every month in the data range; year/month periods show all 12
 *  months of the selected year (a chosen month gets a faint background band).
 *  Hovering a month shows all four of its numbers. */
function Financials({ months, display, highlight, className = "" }: { months: FinMonth[]; display: DisplayCurrency; highlight: number | null; className?: string }) {
  const narrow = useNarrow();
  const [hover, setHover] = useState<number | null>(null);
  // Mobile tap selection (mirrors the Summary graph): coarse pointers toggle
  // a full-size detail card below the plot instead of following the mouse.
  const coarse = useCoarse();
  const detailRef = useRef<HTMLDivElement>(null);
  // Touch drag state (mirrors the Summary graph): pointerdown selects the bar
  // under the finger, pointermove updates live while down, and the click
  // handler tells a tap (toggle/dismiss) apart from a drag (keep drop point).
  const gestureRef = useRef<{ down: boolean; idx: number | null; pre: number | null; moved: boolean }>({ down: false, idx: null, pre: null, moved: false });
  const n = months.length;
  const W = narrow ? 640 : 1160;
  const PT = narrow ? 32 : 30, PB = narrow ? 76 : 70, PL = narrow ? 88 : 70, PR = 20;
  const plotH = narrow ? 360 : 300;
  const H = PT + plotH + PB;
  const plotW = W - PL - PR;
  const slotW = plotW / Math.max(n, 1);
  const barW = Math.max(3, Math.min(slotW * 0.26, 30));
  // Domain: bars ≥ 0; the two lines may dip below zero.
  let hi = Math.max(0, ...months.map((m) => Math.max(m.rev, m.cost)));
  let lo = Math.min(0, ...months.map((m) => Math.min(m.net, m.avg)));
  if (hi - lo < 1e-9) hi = lo + 1;
  const y = (v: number) => PT + ((hi - v) / (hi - lo)) * plotH;
  const zeroY = y(0);
  const withYear = months.some((m) => m.label.includes("'"));
  const effW = (withYear ? 70 : 34) * (narrow ? 16 / 14 : 11 / 14);
  const step = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / effW))));
  const hov = hover !== null && hover >= 0 && hover < n ? months[hover] : null;
  const tipW = 215, tipH = 122;
  const tipX = hover !== null ? Math.min(Math.max(PL + slotW * (hover + 0.5) - tipW / 2, PL), Math.max(PL, W - PR - tipW)) : 0;
  const tipY = PT + 8;
  const rows: [string, number, string][] = hov
    ? [
        ["Revenue", hov.rev, "fill-emerald-600 dark:fill-emerald-400"],
        ["Costs", hov.cost, "fill-rose-600 dark:fill-rose-400"],
        ["Net Profit", hov.net, hov.net >= 0 ? "fill-emerald-600 dark:fill-emerald-400" : "fill-rose-600 dark:fill-rose-400"],
        ["Avg Net", hov.avg, "fill-purple-600 dark:fill-purple-400"],
      ]
    : [];
  if (!n) {
    return (
      <div className={`card p-4 ${className}`}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold">Financials</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-500">Monthly · {display}</p>
        </div>
        <p className="py-10 text-center text-sm text-slate-400 dark:text-zinc-500">No transactions in this period.</p>
      </div>
    );
  }
  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold">Financials</h2>
        <p className="text-xs text-slate-500 dark:text-zinc-500">Monthly · {display}</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Monthly financials" onMouseLeave={() => { if (!coarse) setHover(null); }}
        style={coarse ? { touchAction: "pan-y" } : undefined}
        onPointerDown={(e) => {
          if (!coarse) return;
          const bb = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const vx = ((e.clientX - bb.left) / bb.width) * W;
          const i = Math.floor((vx - PL) / slotW);
          const idx = i >= 0 && i < n ? i : null;
          gestureRef.current = { down: true, idx, pre: hover, moved: false };
          setHover(idx);
          if (idx !== null) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
        }}
        onPointerMove={(e) => {
          const g = gestureRef.current;
          if (!coarse || !g.down) return;
          const bb = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const vx = ((e.clientX - bb.left) / bb.width) * W;
          const i = Math.floor((vx - PL) / slotW);
          if (i !== g.idx) g.moved = true;
          if (i >= 0 && i < n) setHover(i);
        }}
        onPointerUp={() => { gestureRef.current.down = false; }}
        onPointerCancel={() => { gestureRef.current.down = false; }}
        onClick={() => {
          if (!coarse) return;
          const g = gestureRef.current;
          // Drags already left the selection at the drop point — keep it.
          // Taps on the already-selected bar dismiss it (toggle).
          if (!g.moved && g.idx !== null && g.pre === g.idx) setHover(null);
        }}
      >
        {/* Faint band: the month chosen in the period selector (month periods). */}
        {highlight !== null && highlight >= 0 && highlight < n && (
          <rect x={PL + slotW * highlight} y={PT} width={slotW} height={plotH} className="fill-slate-500/10 dark:fill-slate-400/10" />
        )}
        {hover !== null && hover >= 0 && hover < n && (
          <rect x={PL + slotW * hover} y={PT} width={slotW} height={plotH} className="fill-slate-500/[0.16] dark:fill-slate-400/[0.16]" />
        )}
        {/* grid + y labels — 0 is always labeled: whichever tick is nearest
            zero snaps to exactly 0 (so -396 can never crowd out the axis). */}
        {(() => {
          const ticks = [0, 1, 2, 3, 4].map((k) => lo + ((hi - lo) * k) / 4);
          if (lo < 0 && hi > 0) {
            let bi = 0, bd = Infinity;
            ticks.forEach((v, i) => { const d = Math.abs(v); if (d < bd) { bd = d; bi = i; } });
            ticks[bi] = 0;
          }
          return ticks.map((v, i) => {
            const gy = y(v);
            return (
              <g key={i}>
                {v !== 0 && <line x1={PL} x2={W - PR} y1={gy} y2={gy} strokeWidth={1} className="stroke-slate-200/60 dark:stroke-zinc-800/60" />}
                <text x={PL - 8} y={gy + 4} textAnchor="end" fontSize={narrow ? 14 : 11} className="fill-slate-400 dark:fill-zinc-500">{axisMoney(v)}</text>
              </g>
            );
          });
        })()}
        {/* Axes: the x-axis always sits at y=0 and crosses the y-axis there,
            even when the domain extends below zero (e.g. -396). */}
        <line x1={PL} x2={PL} y1={PT} y2={PT + plotH} strokeWidth={1.2} className="stroke-slate-300 dark:stroke-zinc-700" />
        <line x1={PL} x2={W - PR} y1={zeroY} y2={zeroY} strokeWidth={1.5} className="stroke-slate-400 dark:stroke-zinc-500" />
        {/* Revenue / Costs / Net Profit bars (net may dip below zero) */}
        {months.map((m, i) => {
          const cx = PL + slotW * (i + 0.5);
          const on = hover === i;
          const gap = 1.5;
          const x0 = cx - (3 * barW + 2 * gap) / 2;
          const delay = `${Math.min(i * 30, 450)}ms`;
          const up = { transformOrigin: "50% 100%", animationDelay: delay };
          const down = { transformOrigin: "50% 0%", animationDelay: delay };
          return (
            <g key={m.key}>
              {m.rev > 0 && (
                <rect x={x0} y={y(m.rev)} width={barW} height={Math.max(1.5, zeroY - y(m.rev))} rx={2}
                  className={(on ? "fill-emerald-600 dark:fill-emerald-500" : "fill-emerald-500/85 dark:fill-emerald-400/80") + " metrics-bar"}
                  style={up} />
              )}
              {m.cost > 0 && (
                <rect x={x0 + barW + gap} y={y(m.cost)} width={barW} height={Math.max(1.5, zeroY - y(m.cost))} rx={2}
                  className={(on ? "fill-rose-600 dark:fill-rose-500" : "fill-rose-500/85 dark:fill-rose-400/80") + " metrics-bar"}
                  style={up} />
              )}
              {m.net !== 0 && (
                <rect x={x0 + 2 * (barW + gap)} y={Math.min(y(m.net), zeroY)} width={barW}
                  height={Math.max(1.5, Math.abs(zeroY - y(m.net)))} rx={2}
                  className={(on ? "fill-yellow-500 dark:fill-yellow-400" : "fill-yellow-400/85 dark:fill-yellow-400/70") + " metrics-bar"}
                  style={m.net >= 0 ? up : down} />
              )}
            </g>
          );
        })}
        {/* Running Avg Net line (dashed purple) */}
        {n > 1 && (
          <polyline fill="none" strokeWidth={2} strokeDasharray="7 5" className="stroke-purple-500 dark:stroke-purple-400"
            points={months.map((m, i) => `${PL + slotW * (i + 0.5)},${y(m.avg)}`).join(" ")} />
        )}
        {/* x-axis month labels (thinned so they never overlap) */}
        {months.map((m, i) => {
          if (i % step !== 0 && i !== n - 1) return null;
          const cx = PL + slotW * (i + 0.5);
          return (
            <text key={m.key} x={cx} y={H - PB + 20} textAnchor="middle" fontSize={narrow ? 16 : 11}
              className="fill-slate-400 dark:fill-zinc-500">{m.label}</text>
          );
        })}
        {/* Full-slot hit areas: hovering a month shows all four numbers */}
        {months.map((m, i) => {
          const cx = PL + slotW * (i + 0.5);
          return (
            <rect key={`hit-${m.key}`} x={cx - slotW / 2} y={PT} width={slotW} height={plotH}
              fill="transparent"
              onMouseEnter={coarse ? undefined : () => setHover(i)}
              style={{ cursor: coarse ? "pointer" : undefined }} />
          );
        })}
        {hov && (
          <g pointerEvents="none" className="max-md:hidden">
            <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={8} strokeWidth={1}
              className="fill-white stroke-slate-300 dark:fill-zinc-900 dark:stroke-zinc-600" />
            <text x={tipX + 12} y={tipY + 22} fontSize={14} fontWeight={600} className="fill-slate-700 dark:fill-zinc-200">{hov.title}</text>
            <line x1={tipX + 12} x2={tipX + tipW - 12} y1={tipY + 33} y2={tipY + 33} strokeWidth={1} className="stroke-slate-200 dark:stroke-zinc-700" />
            {rows.map(([label, val, colour], ri) => (
              <g key={label}>
                <text x={tipX + 12} y={tipY + 54 + ri * 20} fontSize={13} className="fill-slate-500 dark:fill-zinc-400">{label}</text>
                <text x={tipX + tipW - 12} y={tipY + 54 + ri * 20} textAnchor="end" fontSize={13} fontWeight={600}
                  className={`tabular-nums ${colour}`}>{money(val, display)}</text>
              </g>
            ))}
          </g>
        )}
      </svg>
      {/* Mobile detail card (below the graph, inside the card) — mirrors the
          Summary graph. The in-SVG tooltip stays PC-only (max-md:hidden). */}
      {hov && (
        <div ref={detailRef} className="md:hidden mt-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-3 py-2.5">
          <div className="text-sm font-semibold">{hov.title}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <span className="text-slate-500 dark:text-zinc-400">Revenue</span>
            <span className="text-right font-semibold text-emerald-600 dark:text-emerald-400">{money(hov.rev, display)}</span>
            <span className="text-slate-500 dark:text-zinc-400">Costs</span>
            <span className="text-right font-semibold text-rose-600 dark:text-rose-400">{money(hov.cost, display)}</span>
            <span className="text-slate-500 dark:text-zinc-400">Net Profit</span>
            <span className={`text-right font-semibold ${hov.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{money(hov.net, display)}</span>
            <span className="text-slate-500 dark:text-zinc-400">Avg Net</span>
            <span className="text-right font-semibold text-purple-600 dark:text-purple-400">{money(hov.avg, display)}</span>
          </div>
        </div>
      )}
      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500/85 dark:bg-emerald-400/80" />Revenue</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-rose-500/85 dark:bg-rose-400/80" />Costs</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-yellow-400/85 dark:bg-yellow-400/70" />Net Profit</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-purple-500" />Avg Net</span>
        {highlight !== null && <span className="ml-auto text-slate-400 dark:text-zinc-500">Selected month highlighted</span>}
      </div>
    </div>
  );
}

function TopTagPerMonth({ tx, display, rate, className = "" }: { tx: any[]; display: DisplayCurrency; rate: number; className?: string }) {
  const tagByMonth = new Map<string, Map<string, number>>();
  for (const t of tx) {
    const d = new Date(t.transactionDate);
    if (isNaN(+d)) continue;
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const tags = parseTransactionTags(t.tags);
    if (tags.length === 0) continue;
    if (!tagByMonth.has(month)) tagByMonth.set(month, new Map());
    const m = tagByMonth.get(month)!;
    const a = Math.abs(toDisplay(Number(t.amount) || 0, t.currency, display, rate));
    for (const tag of tags) m.set(tag, (m.get(tag) || 0) + a / tags.length);
  }
  const rows = [...tagByMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, m]) => {
    let topTag: string | null = null, topAmt = 0;
    for (const [tag, amt] of m) if (amt > topAmt) { topAmt = amt; topTag = tag; }
    const [y, mo] = month.split("-");
    const label = `${MONTH_SHORT[Number(mo) - 1]} ${y}`;
    return { month, label, topTag, topAmt };
  });
  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold">Top Tag per Month</h2>
        <p className="text-xs text-slate-500 dark:text-zinc-500">in {display}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead><tr className="border-b border-slate-200 dark:border-zinc-800">
            <th className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-zinc-400">Month</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-zinc-400">Top Tag</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-zinc-400 text-right">Amount</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="table-row">
                <td className="px-3 py-2 text-xs whitespace-nowrap">{r.label}</td>
                <td className="px-3 py-2 text-xs truncate">
                  <span className={`inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-semibold ${transactionTagClasses(r.topTag!)}`}>{r.topTag}</span>
                </td>
                <td className="px-3 py-2 text-xs text-right tabular-nums whitespace-nowrap">{money(r.topAmt, display)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-center text-xs text-slate-400 dark:text-zinc-500">No tagged transactions in this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LargestTx({ tx, display, rate, className = "" }: { tx: any[]; display: DisplayCurrency; rate: number; className?: string }) {
  const sorted = [...tx].sort((a, b) => Math.abs(Number(b.amount) || 0) - Math.abs(Number(a.amount) || 0)).slice(0, 10);
  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold">Largest Transactions</h2>
        <p className="text-xs text-slate-500 dark:text-zinc-500">by size · {display}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead><tr className="border-b border-slate-200 dark:border-zinc-800">
            <th className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-zinc-400">Date</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-zinc-400 truncate">Description</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-zinc-400 text-right">Amount</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-zinc-400">Tags</th>
          </tr></thead>
          <tbody>
            {sorted.map((t) => {
              const tags = parseTransactionTags(t.tags);
              const amt = toDisplay(Number(t.amount) || 0, t.currency, display, rate);
              return (
                <tr key={t.id} className="table-row">
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{dateLabel(t.transactionDate)}</td>
                  <td className="px-3 py-2 text-xs truncate">{t.description || "—"}</td>
                  <td className={`px-3 py-2 text-xs text-right tabular-nums whitespace-nowrap ${amt >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{money(amt, display)}</td>
                  <td className="px-3 py-2 text-xs">
                    {tags.length ? tags.map((tag) => (<span key={tag} className={`inline-block rounded-full border px-1.5 py-px text-[10px] font-semibold ${transactionTagClasses(tag)}`}>{tag}</span>)) : <span className="text-slate-400 dark:text-zinc-500">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const MetricsComponent = ({ transactions, display, rate, vatExclusions }: {
  transactions: any[];
  display: DisplayCurrency;
  rate: number;
  vatExclusions: VatExclusionRule[];
}) => {
  const [cur, setCur] = useState<DisplayCurrency>(display);
  const [kind, setKind] = useState<PeriodKind>("inception");
  const [selYear, setSelYear] = useState<number | null>(null);
  const [selMonth, setSelMonth] = useState<number | null>(null);

  // Years present in the data (desc) + sensible defaults for the selectors.
  const { years, defaultYear, defaultMonth } = useMemo(() => {
    const ys = new Set<number>();
    let latest: Date | null = null;
    for (const t of transactions) {
      const d = new Date(t.transactionDate);
      if (isNaN(+d)) continue;
      ys.add(d.getFullYear());
      if (!latest || +d > +latest) latest = d;
    }
    return {
      years: [...ys].sort((a, b) => b - a),
      defaultYear: latest ? latest.getFullYear() : new Date().getFullYear(),
      defaultMonth: latest ? latest.getMonth() : new Date().getMonth(),
    };
  }, [transactions]);

  const year = selYear ?? defaultYear;
  const month = selMonth ?? defaultMonth;

  const periodTx = useMemo(() => {
    if (kind === "inception") return transactions;
    return transactions.filter((t) => {
      const d = new Date(t.transactionDate);
      if (isNaN(+d)) return false;
      if (d.getFullYear() !== year) return false;
      return kind === "month" ? d.getMonth() === month : true;
    });
  }, [transactions, kind, year, month]);

  const tx = useMemo(
    () => periodTx.map((t) => ({ ...t, amt: toDisplay(Number(t.amount) || 0, t.currency, cur, rate) })),
    [periodTx, cur, rate],
  );

  // Four stat cards. Tax reuses the graph's VAT math: exclusion-aware net
  // inflow/outflow x 5/105, where enabled rules drop rows per side by pattern.
  const cards = useMemo(() => {
    let revenue = 0, costs = 0, vi = 0, vo = 0;
    const inflowRules = vatExclusions.filter((r) => r.side === "inflow" && r.pattern);
    const outflowRules = vatExclusions.filter((r) => r.side === "outflow" && r.pattern);
    for (const t of tx) {
      const tags = parseTransactionTags(t.tags);
      if (tags.includes("Revenue")) revenue += t.amt;
      if (tags.some((x) => COST_TAGS.includes(x))) costs += Math.abs(t.amt);
      else if (t.amt < 0 && tags.includes("Project")) costs += Math.abs(t.amt);
      const desc = t.description || "";
      const excluded = t.amt >= 0
        ? inflowRules.some((r) => desc.includes(r.pattern))
        : outflowRules.some((r) => desc.includes(r.pattern));
      if (!excluded) { if (t.amt >= 0) vi += t.amt; else vo += -t.amt; }
    }
    const tax = VAT_RATE * (vi - vo);
    return { revenue, costs, tax, net: revenue - costs - tax };
  }, [tx, vatExclusions]);

  // Financials: always month buckets (inception = full data range; year/month
  // periods = all 12 months of the selected year, so the chosen month can be
  // highlighted). Uses the same Revenue/Costs/Tax definitions as the stat cards.
  const finMonths = useMemo<FinMonth[]>(() => {
    const conv = (t: any) => ({ ...t, amt: toDisplay(Number(t.amount) || 0, t.currency, cur, rate) });
    const src = (kind === "inception"
      ? transactions
      : transactions.filter((t) => {
          const d = new Date(t.transactionDate);
          return !isNaN(+d) && d.getFullYear() === year;
        })
    ).map(conv) as any[];
    if (!src.length) return [];
    let startM: Date, endM: Date;
    if (kind === "inception") {
      const ds = src.map((t) => new Date(t.transactionDate)).filter((d) => !isNaN(+d)).sort((a, b) => +a - +b);
      startM = new Date(ds[0].getFullYear(), ds[0].getMonth(), 1);
      endM = new Date(ds[ds.length - 1].getFullYear(), ds[ds.length - 1].getMonth(), 1);
    } else {
      startM = new Date(year, 0, 1);
      endM = new Date(year, 11, 1);
    }
    const inflowRules = vatExclusions.filter((r) => r.side === "inflow" && r.pattern);
    const outflowRules = vatExclusions.filter((r) => r.side === "outflow" && r.pattern);
    const map = new Map<string, { rev: number; cost: number; vi: number; vo: number }>();
    for (const t of src) {
      const d = new Date(t.transactionDate);
      if (isNaN(+d)) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      let e = map.get(key);
      if (!e) { e = { rev: 0, cost: 0, vi: 0, vo: 0 }; map.set(key, e); }
      const tags = parseTransactionTags(t.tags);
      if (tags.includes("Revenue")) e.rev += t.amt;
      if (tags.some((x) => COST_TAGS.includes(x))) e.cost += Math.abs(t.amt);
      else if (t.amt < 0 && tags.includes("Project")) e.cost += Math.abs(t.amt);
      const desc = t.description || "";
      const excluded = t.amt >= 0 ? inflowRules.some((r) => desc.includes(r.pattern)) : outflowRules.some((r) => desc.includes(r.pattern));
      if (!excluded) { if (t.amt >= 0) e.vi += t.amt; else e.vo += -t.amt; }
    }
    const out: FinMonth[] = [];
    let cum = 0;
    for (let m = new Date(startM); +m <= +endM; m.setMonth(m.getMonth() + 1)) {
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
      const e = map.get(key);
      const rev = e?.rev || 0, cost = e?.cost || 0;
      const tax = VAT_RATE * ((e?.vi || 0) - (e?.vo || 0));
      const net = rev - cost - tax;
      cum += net;
      out.push({
        key,
        label: kind === "inception" ? `${MONTH_SHORT[m.getMonth()]} '${String(m.getFullYear()).slice(2)}` : MONTH_SHORT[m.getMonth()],
        title: `${MONTH_SHORT[m.getMonth()]} ${m.getFullYear()}`,
        rev, cost, net, avg: cum / (out.length + 1),
      });
    }
    return out;
  }, [transactions, kind, year, cur, rate, vatExclusions]);

  const tagStats = useMemo(() => {
    const map = new Map<string, TagStat>();
    for (const t of tx) {
      const tags = parseTransactionTags(t.tags);
      const a = Math.abs(t.amt);
      if (tags.length === 0) {
        // Untagged transactions get their own donut section.
        if (!map.has("Untagged")) map.set("Untagged", { tag: "Untagged", total: 0, count: 0 });
        const s = map.get("Untagged")!;
        s.total += a;
        s.count += 1;
        continue;
      }
      for (const tag of tags) {
        if (!map.has(tag)) map.set(tag, { tag, total: 0, count: 0 });
        const s = map.get(tag)!;
        s.total += a;
        s.count += 1;
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [tx]);

  // Granularity: daily buckets for a single month, monthly otherwise.
  const gran: "day" | "month" = kind === "month" ? "day" : "month";
  const buckets = useMemo(() => {
    if (!tx.length) return [];
    const map = new Map<string, { net: number; d: Date }>();
    for (const t of tx) {
      const d = new Date(t.transactionDate);
      if (isNaN(+d)) continue;
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const k = gran === "day"
        ? `${d.getFullYear()}-${mm}-${String(d.getDate()).padStart(2, "0")}`
        : `${d.getFullYear()}-${mm}`;
      const b = map.get(k) || { net: 0, d };
      b.net += t.amt;
      map.set(k, b);
    }
    const ds = [...map.values()].map((b) => b.d).sort((a, b) => +a - +b);
    const out: Bucket[] = [];
    if (gran === "day") {
      const start = new Date(ds[0]); start.setHours(0, 0, 0, 0);
      const end = new Date(ds[ds.length - 1]); end.setHours(0, 0, 0, 0);
      for (const d = new Date(start); +d <= +end; d.setDate(d.getDate() + 1)) {
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const k = `${d.getFullYear()}-${mm}-${String(d.getDate()).padStart(2, "0")}`;
        out.push({ key: k, label: String(d.getDate()), net: map.get(k)?.net || 0 });
      }
    } else {
      const s = new Date(ds[0].getFullYear(), ds[0].getMonth(), 1);
      const e = new Date(ds[ds.length - 1].getFullYear(), ds[ds.length - 1].getMonth(), 1);
      for (const d = new Date(s); +d <= +e; d.setMonth(d.getMonth() + 1)) {
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        out.push({ key: k, label: kind === "year" ? MONTH_SHORT[d.getMonth()] : `${MONTH_SHORT[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`, net: map.get(k)?.net || 0 });
      }
    }
    return out;
  }, [tx, gran, kind]);

  // Remount key for graph/table cards: changing period or currency replays
  // their enter + bar-grow animations (StatCards roll numbers instead).
  const animKey = `${kind}-${year}-${month}-${cur}`;

  if (!transactions.length) {
    return <div className="card text-center text-sm text-slate-500 dark:text-zinc-400 p-12">No transactions yet. Upload a bank statement CSV to see metrics.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Controls: PC keeps the single-row layout (unchanged). Mobile mirrors
          the Summary tab — stacked full-width pickers: currency on top, the
          period selector below it, dropdowns under the period row. */}
      <div className="hidden md:flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-800 p-1">
          {([["inception", "Since Inception"], ["year", "Year"], ["month", "Month"]] as const).map(([k, l]) => (
            <button key={k} className={`tab-btn ${kind === k ? "tab-btn-active" : ""}`} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
        {kind !== "inception" && (
          <select className="input !w-auto !py-1 text-sm" value={year} aria-label="Year"
            onChange={(e) => setSelYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
        {kind === "month" && (
          <select className="input !w-auto !py-1 text-sm" value={month} aria-label="Month"
            onChange={(e) => setSelMonth(Number(e.target.value))}>
            {MONTH_SHORT.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        )}
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-800 p-1 ml-auto">
          {(["AED", "USD"] as DisplayCurrency[]).map((c) => (
            <button key={c} className={`tab-btn ${cur === c ? "tab-btn-active" : ""}`} onClick={() => setCur(c)}>{c}</button>
          ))}
        </div>
      </div>
      <div className="md:hidden flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 dark:border-zinc-800 p-1">
          {(["AED", "USD"] as DisplayCurrency[]).map((c) => (
            <button key={c} className={`tab-btn !px-2 text-center ${cur === c ? "tab-btn-active" : ""}`} onClick={() => setCur(c)}>{c}</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 dark:border-zinc-800 p-1">
          {([["inception", "Since Inception"], ["year", "Year"], ["month", "Month"]] as const).map(([k, l]) => (
            <button key={k} className={`tab-btn !px-2 text-center ${kind === k ? "tab-btn-active" : ""}`} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
        {kind !== "inception" && (
          <select className="input !py-1 text-sm" value={year} aria-label="Year"
            onChange={(e) => setSelYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
        {kind === "month" && (
          <select className="input !py-1 text-sm" value={month} aria-label="Month"
            onChange={(e) => setSelMonth(Number(e.target.value))}>
            {MONTH_SHORT.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        )}
      </div>

      {tx.length === 0 ? (
        <div className="card text-center text-sm text-slate-500 dark:text-zinc-400 p-10">No transactions in this period.</div>
      ) : (
        <>
          {/* Stat cards: Revenue, Costs, Tax, Net Profit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total Revenue" amount={cards.revenue} currency={cur} sub="Revenue-tagged" color="text-emerald-600 dark:text-emerald-400" />
            <StatCard label="Total Costs" amount={cards.costs} currency={cur} sub="Expense · Fees · Food · Fuel · Parking · Project" color="text-rose-600 dark:text-rose-400" />
            <StatCard label="Tax" amount={cards.tax} currency={cur} sub="VAT 5/105 after exclusions" color="text-amber-600 dark:text-amber-400" />
            <StatCard label="Net Profit" amount={cards.net} currency={cur} sub="Revenue − Costs − Tax" color={cards.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"} />
          </div>
          <Financials key={animKey} months={finMonths} display={cur} highlight={kind === "month" ? month : null} className="metrics-enter" />
          <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
            <TagDonut tagStats={tagStats} display={cur} className="lg:col-span-4 metrics-enter" />
            <NetFlows key={`net-${animKey}`} buckets={buckets} display={cur} gran={gran} withYear={kind === "inception"} className="lg:col-span-6 metrics-enter" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopTagPerMonth key={`top-${animKey}`} tx={tx} display={cur} rate={rate} className="metrics-enter" />
            <LargestTx key={`largest-${animKey}`} tx={tx} display={cur} rate={rate} className="metrics-enter" />
          </div>
        </>
      )}
    </div>
  );
};
export default MetricsComponent;