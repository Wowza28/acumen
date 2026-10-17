"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type GraphTx = { transactionDate: string; currency: string; amount: number; description?: string };
export type GraphMode = "day" | "month" | "quarter";
export type DisplayCurrency = "AED" | "USD";

/** Enabled VAT-exclusion rule: transactions whose description contains
 *  `pattern` (case-sensitive) are ignored for the quarterly VAT line. */
export type VatExclusionRule = { pattern: string; side: "inflow" | "outflow" };

export type Bucket = {
  key: string;
  label: string;
  fullLabel: string;
  inflow: number;
  outflow: number;
  balance: number;
  vat?: number;
  /** Exclusion-aware, VAT-inclusive sums per side (quarter mode only):
   *  inflow/outflow WITHOUT the transactions covered by an exclusion rule.
   *  The filings table derives Credits/Debits from these so they reconcile
   *  with the VAT line: vatDue === (vatInflow - vatOutflow) x VAT_RATE. */
  vatInflow?: number;
  vatOutflow?: number;
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Amounts are VAT-inclusive, so the VAT component of a net amount is
// 5/105 of it (0.05/1.05), not a flat 5%.
export const VAT_RATE = 0.05 / 1.05;

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function quarterKey(d: Date) {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}
function quarterLabel(key: string) {
  const m = key.match(/^(\d+)-Q([1-4])$/);
  if (!m) return key;
  const q = Number(m[2]);
  return `${MONTH_SHORT[(q - 1) * 3]}-${MONTH_SHORT[(q - 1) * 3 + 2]} '${m[1].slice(2)}`;
}


/** Aggregate transactions into day/month/quarter buckets in display currency.
 *  Each currency is a separate sub-account with its own running balance; the
 *  plotted balance is the sum of both sub-account balances. */
export function buildBuckets(
  transactions: GraphTx[],
  mode: GraphMode,
  display: DisplayCurrency,
  rate: number,
  vatExclusions: VatExclusionRule[] = [],
): Bucket[] {
  const sorted = [...transactions]
    .map((t) => ({ ...t, d: new Date(t.transactionDate) }))
    .filter((t) => !isNaN(+t.d) && Number.isFinite(t.amount))
    .sort((a, b) => +a.d - +b.d);
  if (!sorted.length) return [];

  const toDisplay = (amount: number, currency: string) => {
    const cur = (currency || "").toUpperCase();
    if (display === "AED") return cur === "USD" ? amount * rate : amount;
    return cur === "AED" ? amount / rate : amount;
  };

  const bucketKey = mode === "day" ? dayKey : mode === "month" ? monthKey : quarterKey;
  // VAT uses net inflow/outflow AFTER exclusions: a transaction whose
  // description contains an enabled rule's pattern (case-sensitive) is
  // ignored for VAT. Rules apply by side (credits vs debits).
  const inflowRules = vatExclusions.filter((r) => r.side === "inflow" && r.pattern);
  const outflowRules = vatExclusions.filter((r) => r.side === "outflow" && r.pattern);
  const excludedForVat = (tx: { amount: number; description?: string }) => {
    const desc = tx.description || "";
    if (tx.amount >= 0) return inflowRules.some((r) => desc.includes(r.pattern));
    return outflowRules.some((r) => desc.includes(r.pattern));
  };
  const totals = new Map<string, { inflow: number; outflow: number; d: Date }>();
  const vatTotals = new Map<string, { inflow: number; outflow: number }>();
  for (const t of sorted) {
    const k = bucketKey(t.d);
    let b = totals.get(k);
    if (!b) {
      b = { inflow: 0, outflow: 0, d: t.d };
      totals.set(k, b);
    }
    const v = toDisplay(t.amount, t.currency);
    if (v >= 0) b.inflow += v;
    else b.outflow += -v;
    if (!excludedForVat(t)) {
      let vb = vatTotals.get(k);
      if (!vb) {
        vb = { inflow: 0, outflow: 0 };
        vatTotals.set(k, vb);
      }
      if (v >= 0) vb.inflow += v;
      else vb.outflow += -v;
    }
    if (+t.d < +b.d) b.d = t.d;
  }

  // fill gaps so bars are continuous since inception
  const keys: string[] = [];
  if (mode === "day") {
    const start = new Date(sorted[0].d); start.setHours(0, 0, 0, 0);
    const end = new Date(sorted[sorted.length - 1].d); end.setHours(0, 0, 0, 0);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) keys.push(dayKey(d));
  } else if (mode === "month") {
    const s = new Date(sorted[0].d.getFullYear(), sorted[0].d.getMonth(), 1);
    const e = new Date(sorted[sorted.length - 1].d.getFullYear(), sorted[sorted.length - 1].d.getMonth(), 1);
    for (let d = new Date(s); d <= e; d.setMonth(d.getMonth() + 1)) keys.push(monthKey(d));
  } else {
    const s = new Date(sorted[0].d.getFullYear(), Math.floor(sorted[0].d.getMonth() / 3) * 3, 1);
    const last = sorted[sorted.length - 1].d;
    const e = new Date(last.getFullYear(), Math.floor(last.getMonth() / 3) * 3, 1);
    for (let d = new Date(s); d <= e; d.setMonth(d.getMonth() + 3)) keys.push(quarterKey(d));
  }

  // running balance per sub-account, summed in display currency
  const subBal = new Map<string, number>();
  const byKey = new Map<string, typeof sorted>();
  for (const t of sorted) {
    const k = bucketKey(t.d);
    const arr = byKey.get(k) || [];
    arr.push(t);
    byKey.set(k, arr);
  }
  const out: Bucket[] = [];
  for (const k of keys) {
    for (const tx of byKey.get(k) || []) {
      const cur = (tx.currency || "").toUpperCase();
      subBal.set(cur, (subBal.get(cur) || 0) + tx.amount);
    }
    let balance = 0;
    for (const [cur, bal] of subBal) balance += toDisplay(bal, cur);
    const t = totals.get(k);
    const inflow = t?.inflow || 0;
    const outflow = t?.outflow || 0;
    const vt = vatTotals.get(k);
    const vatInflow = vt?.inflow || 0;
    const vatOutflow = vt?.outflow || 0;
    const d = t?.d || new Date(k.length === 10 ? k + "T00:00:00" : k.length === 7 ? k + "-01T00:00:00" : "2000-01-01T00:00:00");
    const fullLabel =
      mode === "day"
        ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
        : mode === "month"
          ? d.toLocaleDateString(undefined, { year: "numeric", month: "long" })
          : quarterLabel(k);
    const label =
      mode === "day"
        ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : mode === "month"
          ? `${MONTH_SHORT[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`
          : quarterLabel(k);
    out.push({
      key: k, label, fullLabel, inflow, outflow, balance,
      ...(mode === "quarter"
        ? { vat: VAT_RATE * (vatInflow - vatOutflow), vatInflow, vatOutflow }
        : {}),
    });
  }
  return out;
}

export function fmtMoney(v: number, currency: string) {
  const sign = v < 0 ? "-" : "";
  return `${currency} ${sign}${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Smooth morph: resample previous buckets onto the new axis, then tween. */
function useTweenedBuckets(buckets: Bucket[]): Bucket[] {
  const [shown, setShown] = useState<Bucket[]>(buckets);
  const shownRef = useRef<Bucket[]>(buckets);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = shownRef.current;
    const to = buckets;
    if (!from.length || !to.length) {
      shownRef.current = to;
      setShown(to);
      return;
    }
    const fromByKey = new Map(from.map((b) => [b.key, b]));
    const start: Bucket[] = to.map((b, i) => {
      const hit = fromByKey.get(b.key);
      if (hit) return { ...b, inflow: hit.inflow, outflow: hit.outflow, balance: hit.balance, vat: hit.vat ?? b.vat };
      const j = Math.min(from.length - 1, Math.round((i / Math.max(1, to.length - 1)) * (from.length - 1)));
      const near = from[j];
      return { ...b, inflow: near?.inflow ?? 0, outflow: near?.outflow ?? 0, balance: near?.balance ?? 0, vat: near?.vat ?? b.vat };
    });
    const t0 = performance.now();
    const dur = 450;
    cancelAnimationFrame(rafRef.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      const cur = to.map((b, i) => {
        const s = start[i];
        const mix = (a: number, c: number) => a + (c - a) * e;
        return {
          ...b,
          inflow: mix(s.inflow, b.inflow),
          outflow: mix(s.outflow, b.outflow),
          balance: mix(s.balance, b.balance),
          vat: b.vat !== undefined || s.vat !== undefined ? mix(s.vat || 0, b.vat || 0) : undefined,
        };
      });
      shownRef.current = cur;
      setShown(cur);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [buckets]);

  return shown;
}

const W = 1160;
// Fixed plot height (balance line + inflow bars). Outflow bars get their own
// dedicated zone below the base axis, with x-labels underneath — so labels
// can never overlap the red bars no matter how long they get.
const PLOT_H = 300;
const LABEL_H = 26;
const OUT_MAX = 108;
const PAD = { l: 76, r: 24, t: 14 };

function compact(v: number) {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toFixed(0);
}

export default function AccountsGraph({
  transactions,
  rate,
  display,
  mode,
  vatExclusions = [],
}: {
  transactions: GraphTx[];
  rate: number;
  display: DisplayCurrency;
  mode: GraphMode;
  vatExclusions?: VatExclusionRule[];
}) {
  const buckets = useMemo(() => buildBuckets(transactions, mode, display, rate, vatExclusions), [transactions, mode, display, rate, vatExclusions]);
  // Mobile shows the exact same full dataset as PC (no truncation) — the
  // detail readout moves to an HTML card below the graph instead.
  const shown = useTweenedBuckets(buckets);
  const [hover, setHover] = useState<number | null>(null);
  // Two separate flags so layout always agrees with the CSS breakpoint and
  // tap handling always follows the actual pointer:
  //  - narrow: max-width 767px → square layout, rotated/bigger axis labels
  //    (matches the mobile CSS rules in globals.css exactly).
  //  - coarse: touch pointer → tap handlers (synthesized mousemove on tap
  //    would otherwise pre-set hover and the click toggle cancels itself).
  // Both start false so SSR hydration matches, then flip after mount.
  const [narrow, setNarrow] = useState(false);
  const [coarse, setCoarse] = useState(false);
  // Mobile tap/drag: ref to the details card (scroll it into view on tap)
  // and a drag flag so pointermove updates live while the finger is down.
  const detailRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);
  useEffect(() => {
    const wq = window.matchMedia("(max-width: 767px)");
    const pq = window.matchMedia("(pointer: coarse)");
    const apply = () => { setNarrow(wq.matches); setCoarse(pq.matches); };
    apply();
    wq.addEventListener("change", apply);
    pq.addEventListener("change", apply);
    return () => { wq.removeEventListener("change", apply); pq.removeEventListener("change", apply); };
  }, []);

  const hasVat = mode === "quarter";
  const maxFlow = Math.max(1, ...shown.map((b) => Math.max(b.inflow, b.outflow)));
  const allLine = shown.flatMap((b) => [b.balance, ...(b.vat !== undefined ? [b.vat] : [])]);
  const minLine = Math.min(0, ...allLine);
  const maxLine = Math.max(0, ...allLine);
  const span = Math.max(1e-9, maxLine - minLine);

  // Mobile-only geometry (PC keeps the exact original constants): wider left
  // pad so the bigger axis numbers fit, a tall label band for rotated x
  // labels, and a plot height chosen so the viewBox ends up SQUARE (H === W,
  // 1160x1160) — the graph renders as a square on the phone.
  // Narrow: bigger top pad so the 44px white top y-number isn't clipped at
  // the viewBox edge, and a left pad that fits the numbers snugly (graph
  // doesn't have to be a perfect square). Plot height still chosen so
  // H === W (near-square) on narrow screens.
  const PT = narrow ? 110 : PAD.t;
  const PL = narrow ? 160 : PAD.l;
  const LH = narrow ? 330 : LABEL_H;
  const iw = W - PL - PAD.r;
  // Plot (line + inflow) is fixed height. The outflow zone scales with the
  // longest outflow bar so labels always sit below it: total height grows,
  // the plot itself never moves.
  const maxOutflow = Math.max(0, ...shown.map((b) => b.outflow));
  const outZoneH = maxOutflow > 0
    ? Math.min(OUT_MAX, Math.max(40, (maxOutflow / maxFlow) * 165))
    : 0;
  const plotH = narrow ? W - PT - outZoneH - LH : PLOT_H;
  const H = PT + plotH + outZoneH + LH; // narrow: exactly W → near-square
  const barH = plotH;
  const zeroY = PT + ((maxLine - 0) / span) * barH;
  const baseY = PT + barH;
  const labelY = baseY + outZoneH + 20;
  const showBalDots = mode !== "day";
  const n = Math.max(1, shown.length);
  const slot = iw / n;
  const barW = Math.max(1.5, Math.min(46, slot * 0.62));

  const x = (i: number) => PL + slot * i + slot / 2;
  const yLine = (v: number) => PT + ((maxLine - v) / span) * barH;
  const hFlow = (v: number) => (v / maxFlow) * (barH * 0.42);
  const hOut = (v: number) => (outZoneH > 0 && maxOutflow > 0 ? (v / maxOutflow) * (outZoneH - 8) : 0);

  const linePath = (get: (b: Bucket) => number) => {
    if (!shown.length) return "";
    return shown.map((b, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yLine(get(b)).toFixed(1)}`).join(" ");
  };

  const tickIdx = useMemo(() => {
    if (!shown.length) return [] as number[];
    const step = Math.max(1, Math.ceil(shown.length / 10));
    const out: number[] = [];
    for (let i = 0; i < shown.length; i += step) out.push(i);
    if (out[out.length - 1] !== shown.length - 1) out.push(shown.length - 1);
    return out;
  }, [shown]);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => minLine + span * f);
  const hov = hover !== null ? shown[hover] : null;
  const empty = !buckets.length;
  const balPath = linePath((b) => b.balance);
  const vatPath = linePath((b) => b.vat || 0);

  return (
    <div className="w-full select-none accounts-graph">
      {!empty && (
        <div className="accounts-legend flex flex-wrap items-center gap-x-5 gap-y-1 px-1 pb-2 text-xs text-slate-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/80" /> Inflow
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-rose-500/80" /> Outflow
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 rounded bg-sky-500" /> Balance
          </span>
          {hasVat && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5 rounded bg-amber-500" />
              <span className="max-md:hidden">VAT (5/105 x net, VAT-inclusive)</span>
              <span className="md:hidden">VAT</span>
            </span>
          )}
          {/* PC caption (unchanged). Mobile captions removed — not needed. */}
          <span className="ml-auto max-md:hidden">All values in {display}</span>
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", touchAction: "pan-y" }}
        role="img"
        aria-label={`Cashflow graph in ${display}`}
        onMouseLeave={() => { if (!coarse) setHover(null); }}
        onPointerDown={(e) => {
          if (!coarse || empty) return;
          const bb = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const vx = ((e.clientX - bb.left) / bb.width) * W;
          const i = Math.floor((vx - PL) / slot);
          if (i < 0 || i >= shown.length) { setHover(null); return; }
          dragRef.current = true;
          setHover(i);
          // Tap: scroll the PAGE to the bottom so the details card (the last
          // element on Summary) is on screen — a no-op when already there.
          requestAnimationFrame(() => {
            const bottom = Math.max(
              document.documentElement.scrollHeight,
              document.body.scrollHeight
            );
            window.scrollTo({ top: bottom, behavior: "smooth" });
          });
        }}
        onPointerMove={(e) => {
          if (!coarse || !dragRef.current) return;
          const bb = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const vx = ((e.clientX - bb.left) / bb.width) * W;
          const i = Math.floor((vx - PL) / slot);
          if (i >= 0 && i < shown.length) setHover(i);
        }}
        onPointerUp={() => { dragRef.current = false; }}
        onPointerCancel={() => { dragRef.current = false; }}
      >
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PL} x2={W - PAD.r} y1={yLine(v)} y2={yLine(v)} className="stroke-slate-200 dark:stroke-zinc-800" strokeWidth={1} />
            {/* PC axis numbers (unchanged). Mobile: bigger + white via CSS. */}
            <text x={PL - 8} y={yLine(v) + 4} textAnchor="end" fontSize={11} className="fill-slate-400 dark:fill-zinc-500 ag-y">
              {compact(v)}
            </text>
          </g>
        ))}
        {minLine < 0 && maxLine > 0 && (
          <line x1={PL} x2={W - PAD.r} y1={zeroY} y2={zeroY} className="stroke-slate-300 dark:stroke-zinc-700" strokeWidth={1} strokeDasharray="4 3" />
        )}
        {empty ? (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={14} className="fill-slate-400 dark:fill-zinc-500">
            No transactions yet - upload a statement to see the graph.
          </text>
        ) : (
          <g>
            {shown.map((b, i) => {
              const cx = x(i);
              const inH = hFlow(b.inflow);
              const outH = hOut(b.outflow);
              return (
                <g key={b.key}>
                  {b.inflow > 0 && (
                    <rect x={cx - barW / 2} y={baseY - inH} width={barW} height={Math.max(1, inH)} rx={Math.min(3, barW / 3)}
                      className="fill-emerald-500/75 dark:fill-emerald-400/70" />
                  )}
                  {b.outflow > 0 && (
                    <rect x={cx - barW / 2} y={baseY} width={barW} height={Math.max(1, outH)} rx={Math.min(3, barW / 3)}
                      className="fill-rose-500/75 dark:fill-rose-400/70" />
                  )}
                </g>
              );
            })}
            <path d={balPath} fill="none" strokeWidth={2.5}
              className="stroke-sky-500 dark:stroke-sky-400" strokeLinejoin="round" strokeLinecap="round" />
            {showBalDots && shown.map((b, i) => (
              <circle key={"bal" + b.key} cx={x(i)} cy={yLine(b.balance)} r={hover === i ? 5 : 3}
                className="fill-sky-500 dark:fill-sky-400 stroke-white dark:stroke-zinc-950" strokeWidth={1.5} />
            ))}
            {hasVat && (
              <g>
                <path d={vatPath} fill="none" strokeWidth={2} strokeDasharray="7 4"
                  className="stroke-amber-500 dark:stroke-amber-400" strokeLinejoin="round" strokeLinecap="round" />
                {shown.map((b, i) => (
                  <circle key={"vat" + b.key} cx={x(i)} cy={yLine(b.vat || 0)} r={hover === i ? 4.5 : 2.5}
                    className="fill-amber-500 dark:fill-amber-400 stroke-white dark:stroke-zinc-950" strokeWidth={1.5} />
                ))}
              </g>
            )}
            {/* Mobile: x labels rotate (bottom-to-top) so big text fits; PC stays horizontal. */}
            {tickIdx.map((i) => (
              <text key={i} x={x(i)} y={labelY}
                textAnchor={narrow ? "end" : "middle"}
                transform={narrow ? `rotate(-90 ${x(i)} ${labelY})` : undefined}
                fontSize={11} className="fill-slate-400 dark:fill-zinc-500 ag-x">
                {shown[i].label}
              </text>
            ))}
            {shown.map((b, i) => (
              <rect key={"hit" + b.key} x={PL + slot * i} y={PT} width={slot} height={barH + outZoneH} fill="transparent"
                style={{ cursor: coarse ? "pointer" : "auto" }}
                onMouseEnter={coarse ? undefined : () => setHover(i)}
                onMouseMove={coarse ? undefined : () => setHover(i)} />
            ))}
            {hov && hover !== null && (
              <g pointerEvents="none" className="max-md:hidden">
                <line x1={x(hover)} x2={x(hover)} y1={PT} y2={baseY + outZoneH} className="stroke-slate-300 dark:stroke-zinc-600" strokeWidth={1} />
                <TipBox x={x(hover)} y={Math.min(yLine(hov.balance), baseY - hFlow(hov.inflow))} hov={hov} display={display} hasVat={hasVat} H={H} />
              </g>
            )}
            {/* Mobile: crosshair line only (no in-SVG tooltip) — the detail
                card renders below the graph as HTML. */}
            {hov && hover !== null && (
              <g pointerEvents="none" className="md:hidden">
                <line x1={x(hover)} x2={x(hover)} y1={PT} y2={baseY + outZoneH} className="stroke-slate-300 dark:stroke-zinc-600" strokeWidth={1} />
              </g>
            )}
          </g>
        )}
        <line x1={PL} x2={W - PAD.r} y1={baseY} y2={baseY} className="stroke-slate-300 dark:stroke-zinc-700" strokeWidth={1} />
      </svg>
      {/* Mobile detail card: full-width HTML readout for the tapped bar —
          easier to read than the in-graph tooltip. PC untouched (hidden). */}
      {hov && (
        <div ref={detailRef} className="md:hidden mt-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-3 py-2.5">
          <div className="text-sm font-semibold">{hov.fullLabel}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <span className="text-slate-500 dark:text-zinc-400">In</span>
            <span className="text-right font-semibold text-emerald-600 dark:text-emerald-400">{fmtMoney(hov.inflow, display)}</span>
            <span className="text-slate-500 dark:text-zinc-400">Out</span>
            <span className="text-right font-semibold text-rose-600 dark:text-rose-400">{fmtMoney(hov.outflow, display)}</span>
            <span className="text-slate-500 dark:text-zinc-400">Balance</span>
            <span className="text-right font-semibold text-sky-600 dark:text-sky-400">{fmtMoney(hov.balance, display)}</span>
            {/* VAT row always renders (blank on Day/Month) so the card keeps a
                constant height — switching modes never jumps the layout. */}
            <span className="text-slate-500 dark:text-zinc-400">{hasVat ? "VAT" : ""}</span>
            <span className="text-right font-semibold text-amber-600 dark:text-amber-400">{hasVat ? fmtMoney(hov.vat || 0, display) : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TipBox({ x, y, hov, display, hasVat, H }: { x: number; y: number; hov: Bucket; display: string; hasVat: boolean; H: number }) {
  const rows: Array<[string, string, string]> = [
    ["In", fmtMoney(hov.inflow, display), "fill-emerald-600 dark:fill-emerald-400"],
    ["Out", fmtMoney(hov.outflow, display), "fill-rose-600 dark:fill-rose-400"],
    ["Balance", fmtMoney(hov.balance, display), "fill-sky-600 dark:fill-sky-400"],
  ];
  if (hasVat) rows.push(["VAT", fmtMoney(hov.vat || 0, display), "fill-amber-600 dark:fill-amber-400"]);
  const w = 224;
  const h = 32 + rows.length * 20;
  const tx = Math.min(Math.max(x + 12, PAD.l), W - PAD.r - w);
  const ty = Math.min(Math.max(y - h - 10, 4), H - h - 30);
  return (
    <g transform={`translate(${tx},${ty})`}>
      <rect width={w} height={h} rx={10} className="fill-white dark:fill-zinc-900 stroke-slate-200 dark:stroke-zinc-700" strokeWidth={1.2} />
      <text x={12} y={20} fontSize={12} fontWeight={700} className="fill-slate-800 dark:fill-zinc-100">{hov.fullLabel}</text>
      {rows.map(([k, v, cls], i) => (
        <g key={k}>
          <text x={12} y={40 + i * 20} fontSize={12} className="fill-slate-400 dark:fill-zinc-500">{k}</text>
          <text x={w - 12} y={40 + i * 20} fontSize={12} fontWeight={600} textAnchor="end" className={cls}>{v}</text>
        </g>
      ))}
    </g>
  );
}




