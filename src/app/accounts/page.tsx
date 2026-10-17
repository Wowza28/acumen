"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Transaction, VatExclusion } from "@/lib/types";
import { money, dateLabel } from "@/lib/ui";
import Shell from "@/components/Shell";
import PageHeader from "@/components/PageHeader";
import SlideOver from "@/components/SlideOver";
import { IconUpload, IconPlus, IconTrash, IconPencil, IconCheck } from "@/components/icons";
import AccountsGraph, { buildBuckets, type DisplayCurrency, type GraphMode, type VatExclusionRule } from "@/components/AccountsGraph";
import { TRANSACTION_TAGS, parseTransactionTags, transactionTagClasses } from "@/components/TransactionTags";
import TagDropdown from "@/components/TagDropdown";
import TransactionDrawer from "@/components/TransactionDrawer";





function isVatExcluded(t: { amount: number; description?: string | null }, exclusions: VatExclusion[]) {
  const desc = t.description || "";
  const side = t.amount >= 0 ? "inflow" : "outflow";
  return exclusions.some((e) => e.enabled && e.side === side && e.pattern && desc.includes(e.pattern));
}

/** Search matching for the Transactions tab: description (partial,
 *  case-insensitive), tag name (partial, case-insensitive), amount
 *  (within ±100), or date as displayed
 *  (e.g. "Jun 30, 2026", case-insensitive substring). */
function matchesSearch(t: Transaction, q: string) {
  const query = q.trim();
  if (!query) return true;
  const ql = query.toLowerCase();
  if ((t.description || "").toLowerCase().includes(ql)) return true;
  if (parseTransactionTags(t.tags).some((tag) => tag.toLowerCase().includes(ql))) return true;
  const num = Number(query.replace(/,/g, ""));
  if (query !== "" && Number.isFinite(num) && Math.abs(Number(t.amount) - num) <= 100) return true;
  if (dateLabel(t.transactionDate).toLowerCase().includes(ql)) return true;
  return false;
}

export default function AccountsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [currencySort, setCurrencySort] = useState<"AED" | "USD" | null>(null);
  const [dateSort, setDateSort] = useState<"desc" | "asc">("desc");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"tx" | "graph" | "vat">("graph");
  const [mode, setMode] = useState<GraphMode>("month");
  const [display, setDisplay] = useState<DisplayCurrency>("AED");
  const [rate, setRate] = useState(3.67);
  const [exclusions, setExclusions] = useState<VatExclusion[]>([]);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Bulk selection (radio column) + bulk action dropdowns on the tx tab.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const [peopleList, setPeopleList] = useState<Array<{ id: string; name: string }>>([]);
  const [projectsList, setProjectsList] = useState<Array<{ id: string; title: string }>>([]);
  // Mobile-only overflow menu: tabs + Upload Statement behind a hamburger in
  // the title row (the always-visible tab row / upload button are hidden on
  // small screens to save vertical space). PC keeps the inline controls.
  // Outside-tap-to-close is handled by a transparent backdrop rendered under
  // the panel — no document-level listeners, so menu clicks can't race it.
  const [menuOpen, setMenuOpen] = useState(false);

  async function loadExclusions() {
    const data = await fetch("/api/vat-exclusions").then((r) => r.json()).catch(() => []);
    setExclusions(Array.isArray(data) ? data : []);
  }

  // Enabled rules only — passed to the graph for the VAT line.
  const activeRules: VatExclusionRule[] = useMemo(
    () => exclusions.filter((e) => e.enabled && e.pattern).map((e) => ({ pattern: e.pattern, side: e.side as "inflow" | "outflow" })),
    [exclusions],
  );

  // VAT Filings: reuse the graph's quarter buckets (AED, same exclusions) so
  // Credits/Debits/VAT Due match the Quarter graph exactly. Credits/Debits are
  // the graph inflows/outflows with VAT removed (÷1.05); VAT Due is the graph's
  // VAT line value (already exclusion-aware).
  const vatFilings = useMemo(() => {
    const buckets = buildBuckets(transactions, "quarter", "AED", rate, activeRules);
    return buckets.map((b) => {
      const m = b.key.match(/^(\d+)-Q([1-4])$/);
      const year = m ? m[1] : b.key;
      const q = m ? Number(m[2]) : 0;
      const months = q >= 1 && q <= 4
        ? ["Jan-Mar", "Apr-Jun", "Jul-Sep", "Oct-Dec"][q - 1]
        : "";
      const period = q ? `Q${q} ${year} (${months})` : b.key;
      return {
        key: b.key,
        period,
        // Exclusion-aware: rows covered by an enabled exclusion rule (either
        // side) are dropped from these sums, so Credits/Debits reconcile with
        // the VAT line exactly — VAT Due === (credits - debits) x 5%.
        credits: (b.vatInflow ?? b.inflow) / 1.05,
        debits: (b.vatOutflow ?? b.outflow) / 1.05,
        vatDue: b.vat || 0,
      };
    }).reverse(); // newest quarter first
  }, [transactions, rate, activeRules]);

  async function load() {
    const data = await fetch("/api/transactions").then((r) => r.json()).catch(() => []);
    const rows = Array.isArray(data) ? data : [];
    setTransactions(rows);
    // Keep the open drawer in sync after a bulk tag change (it re-tags
    // same-description siblings, whose rows also changed).
    setSelected((sel) => {
      if (!sel) return sel;
      const fresh = rows.find((t: Transaction) => t.id === sel.id);
      return fresh || sel;
    });
  }
  useEffect(() => { load(); loadExclusions(); }, []);
  // Dropdown source lists for bulk link actions (load once).
  useEffect(() => {
    fetch("/api/contacts").then((r) => r.json()).then((j) => { if (Array.isArray(j)) setPeopleList(j); }).catch(() => {});
    fetch("/api/projects").then((r) => r.json()).then((j) => { if (Array.isArray(j)) setProjectsList(j); }).catch(() => {});
  }, []);
  useEffect(() => {
    fetch("/api/settings/exchange-rate").then((r) => r.json()).then((j) => {
      if (Number.isFinite(Number(j?.rate)) && Number(j.rate) > 0) setRate(Number(j.rate));
    }).catch(() => {});
    const h = (e: Event) => {
      const r = (e as CustomEvent)?.detail?.rate;
      if (Number.isFinite(Number(r)) && Number(r) > 0) setRate(Number(r));
    };
    window.addEventListener("acumen:exchange-rate", h as EventListener);
    return () => window.removeEventListener("acumen:exchange-rate", h as EventListener);
  }, []);
  // Separate sub-account balances per currency (latest running balance seen).
  const subBalances = useMemo(() => {
    const latest = new Map<string, { balance: number; date: number; seq: number }>();
    for (const t of transactions) {
      if (t.balance == null || !Number.isFinite(Number(t.balance))) continue;
      const cur = (t.currency || "").toUpperCase();
      const d = new Date(t.transactionDate).getTime();
      const seq = t.seq ?? 0;
      const prev = latest.get(cur);
      // Strictly-later wins; same-day ties go to the later statement row
      // (seq) so the final balance is the chronologically last transaction.
      if (!prev || d > prev.date || (d === prev.date && seq > prev.seq)) {
        latest.set(cur, { balance: Number(t.balance), date: isNaN(d) ? 0 : d, seq });
      }
    }
    return latest;
  }, [transactions]);
  // Combined balance across sub-accounts, converted to the graph's currency.
  const combinedBalance = useMemo(() => {
    let total = 0;
    for (const [cur, v] of subBalances) {
      if (display === "AED") total += cur === "USD" ? v.balance * rate : v.balance;
      else total += cur === "AED" ? v.balance / rate : v.balance;
    }
    return total;
  }, [subBalances, display, rate]);
  const sortedTransactions = useMemo(() => {
    const rows = transactions.filter((t) => matchesSearch(t, search));
    rows.sort((a, b) => {
      if (currencySort && a.currency !== b.currency) {
        if (a.currency === currencySort) return -1;
        if (b.currency === currencySort) return 1;
      }
      const byDate = new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime();
      if (byDate !== 0) return dateSort === "desc" ? -byDate : byDate;
      // Same-day: mirror the date direction — "latest first" puts the day's
      // LAST statement row (highest seq) on top; ascending keeps CSV order.
      const bySeq = (a.seq ?? 0) - (b.seq ?? 0);
      if (bySeq !== 0) return dateSort === "desc" ? -bySeq : bySeq;
      return dateSort === "desc" ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id);
    });
    return rows;
  }, [transactions, search, currencySort, dateSort]);

  function toggleCurrencySort() {
    setCurrencySort((current) => current === null ? "AED" : current === "AED" ? "USD" : null);
  }
  function toggleDateSort() {
    setDateSort((current) => current === "desc" ? "asc" : "desc");
  }

  // ---- bulk selection + actions (tx tab) ----
  const allShownChecked = sortedTransactions.length > 0 && sortedTransactions.every((t) => checkedIds.has(t.id));
  function toggleSelectAll() {
    setCheckedIds(allShownChecked ? new Set() : new Set(sortedTransactions.map((t) => t.id)));
  }
  function toggleChecked(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function runBulk(action: () => Promise<{ count: number; note?: string }>) {
    if (bulkBusy) return;
    setBulkBusy(true); setBulkMsg("");
    action()
      .then(({ count, note }) => {
        setBulkMsg(note || `Done for ${count} transaction${count === 1 ? "" : "s"}.`);
        load(); loadExclusions();
      })
      .catch((e: any) => setBulkMsg(e?.message || "Bulk action failed."))
      .finally(() => setBulkBusy(false));
  }
  function bulkModifyTag(tag: string) {
    if (!tag || !checkedIds.size) return;
    const ids = [...checkedIds];
    const rows = transactions.filter((t) => checkedIds.has(t.id));
    // Toggle semantics: if EVERY selected transaction already carries the tag,
    // strip it from all of them; otherwise add it to all of them — so the
    // selection ends up uniform either way.
    const allHave = rows.length === ids.length && rows.every((t) => parseTransactionTags(t.tags).includes(tag));
    runBulk(async () => {
      const r = await fetch("/api/transaction-tags", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(allHave ? { ids, remove: [tag] } : { ids, add: [tag] }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not update tags.");
      const n = typeof j.updated === "number" ? j.updated : ids.length;
      return {
        count: n,
        note: `${allHave ? "Removed" : "Added"} "${tag}" ${allHave ? "from" : "to"} ${n} transaction${n === 1 ? "" : "s"}.`,
      };
    });
  }
  function bulkLink(field: "contactId" | "projectId", id: string) {
    if (!id || !checkedIds.size) return;
    const ids = [...checkedIds];
    runBulk(async () => {
      const r = await fetch("/api/transaction-links/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionIds: ids, [field]: id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not link transactions.");
      return { count: typeof j.linked === "number" ? j.linked : ids.length };
    });
  }
  function bulkExclude() {
    const rows = sortedTransactions.filter((t) => checkedIds.has(t.id));
    if (!rows.length) return;
    // One exclusion rule per (side, trimmed description); skip rows already
    // covered by an enabled rule so repeated clicks don't duplicate.
    const wanted = new Map<string, "inflow" | "outflow">();
    for (const t of rows) {
      const desc = (t.description || "").trim();
      if (!desc || desc.length > 200) continue;
      const side: "inflow" | "outflow" = t.amount >= 0 ? "inflow" : "outflow";
      const key = `${side}|${desc}`;
      if (!wanted.has(key) && !isVatExcluded(t, exclusions)) wanted.set(key, side);
    }
    if (!wanted.size) { setBulkMsg("Nothing new to exclude — descriptions are already covered or empty."); return; }
    runBulk(async () => {
      let created = 0, failed = 0;
      for (const [key, side] of wanted) {
        const pattern = key.slice(key.indexOf("|") + 1);
        try {
          const r = await fetch("/api/vat-exclusions", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ side, pattern }),
          });
          if (r.ok) created++; else failed++;
        } catch { failed++; }
      }
      const skipped = wanted.size - created;
      const note = `Added ${created} exclusion rule${created === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}${skipped ? `, ${skipped} skipped` : ""}.`;
      return { count: created, note };
    });
  }
  function bulkDelete() {
    const ids = [...checkedIds];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected transaction${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    runBulk(async () => {
      const r = await fetch("/api/transactions", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not delete transactions.");
      setCheckedIds(new Set());
      const n = typeof j.deleted === "number" ? j.deleted : ids.length;
      return { count: n, note: `Deleted ${n} transaction${n === 1 ? "" : "s"}.` };
    });
  }

  async function uploadStatement(file?: File) {
    if (!file) return;
    setUploading(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/transactions/import", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Statement import failed.");
      const bits: string[] = [`Imported ${result.imported} transaction${result.imported === 1 ? "" : "s"}`];
      if (result.duplicates) bits.push(`ignored ${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"}`);
      if (result.skipped) bits.push(`skipped ${result.skipped} invalid row${result.skipped === 1 ? "" : "s"}`);
      setMessage(bits.join("; ") + ".");
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Statement import failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Shell wide>
      <PageHeader icon="accounts" title="Accounts" right={
        <div className="flex items-center gap-2">
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => uploadStatement(e.target.files?.[0])} />
          {/* PC: inline upload button (unchanged). */}
          <button className="btn !py-1.5 items-center gap-1.5 hidden md:flex" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <IconUpload /> {uploading ? "Importing…" : "Upload Statement"}
          </button>
          {/* Mobile: hamburger in the title row opens tabs + Upload Statement.
              A transparent backdrop behind the panel handles ALL closing:
              tap outside → closes; tap the hamburger while open → the tap
              hits the backdrop and closes (next tap reopens); menu items sit
              above the backdrop so their clicks always land. */}
          <div className="relative md:hidden">
            <button className="icon-btn" title="Menu" aria-haspopup="menu" aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}>☰</button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} aria-hidden />
                <div className="absolute right-0 top-full mt-1 z-30 card !p-1 min-w-[170px]">
                  {([["graph", "Summary"], ["tx", "Transactions"], ["vat", "VAT"]] as const).map(([id, label]) => (
                    <button key={id}
                      className={`btn-ghost w-full text-left text-xs ${tab === id ? "navitem-active font-semibold" : ""}`}
                      onClick={() => { setTab(id); setMenuOpen(false); }}>
                      {label}
                    </button>
                  ))}
                  <div className="border-t border-slate-200 dark:border-zinc-700 my-1" />
                  <button className="btn-ghost w-full text-left text-xs" disabled={uploading}
                    onClick={() => { setMenuOpen(false); inputRef.current?.click(); }}>
                    {uploading ? "Importing…" : "Upload Statement"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      } />
      {/* Mobile: current tab name under the title (the tab row itself lives in
          the hamburger menu on small screens). White + all-caps + larger than
          the text-lg page title; light theme falls back to near-black so it
          stays readable on white. */}
      <div className="md:hidden text-2xl font-semibold uppercase tracking-wide text-slate-900 dark:text-white -mt-1 mb-3">
        {tab === "graph" ? "Summary" : tab === "tx" ? "Transactions" : "VAT"}
      </div>
      <div className="mb-4 flex items-center gap-1 max-md:hidden">
        <button className={`tab-btn ${tab === "graph" ? "tab-btn-active" : ""}`} onClick={() => setTab("graph")}>Summary</button>
        <button className={`tab-btn ${tab === "tx" ? "tab-btn-active" : ""}`} onClick={() => setTab("tx")}>Transactions</button>
        <button className={`tab-btn ${tab === "vat" ? "tab-btn-active" : ""}`} onClick={() => setTab("vat")}>VAT</button>
      </div>
      {message && <div className="mb-3 text-sm text-slate-500 dark:text-zinc-400">{message}</div>}
      {tab === "graph" ? (
      <div className="flex flex-col gap-4">
        {!!subBalances.size && (
          <>
            {/* PC balance row (unchanged) */}
            <div className="grid-cols-1 sm:grid-cols-3 gap-3 max-md:hidden grid">
              <div className="card !py-3 border-brand-500/40 dark:border-brand-400/40">
                <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-zinc-500">All Accounts</div>
                <div className="text-lg font-semibold">{money(combinedBalance, display)}</div>
                <div className="text-xs text-slate-400 dark:text-zinc-500">Combined balance in {display}</div>
              </div>
              {[...subBalances.entries()].map(([cur, v]) => (
                <div key={cur} className="card !py-3">
                  <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-zinc-500">{cur} sub-account</div>
                  <div className="text-lg font-semibold">{money(v.balance, cur)}</div>
                  <div className="text-xs text-slate-400 dark:text-zinc-500">Latest balance from statements</div>
                </div>
              ))}
            </div>
            {/* Mobile: single compact balance strip — no stacked tall cards */}
            <div className="md:hidden rounded-xl border border-brand-500/40 dark:border-brand-400/40 bg-white dark:bg-zinc-900 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-zinc-500">All Accounts</span>
                <span className="text-base font-semibold truncate">{money(combinedBalance, display)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 dark:text-zinc-500">
                {[...subBalances.entries()].map(([cur, v]) => (
                  <span key={cur} className="shrink-0">{cur} {money(v.balance, "")}</span>
                ))}
              </div>
            </div>
          </>
        )}
        {/* PC: rate line inside the graph card (unchanged). Mobile: rate sits
            between the balance strip and the graph card. */}
        <div className="card max-md:contents">
          {/* PC: single control row (unchanged). Mobile: stacked, full-width
              segmented pickers so buttons aren't scattered or cramped. */}
          <div className="hidden md:flex flex-wrap items-center gap-2 mb-3">
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-800 p-1">
              {(["day", "month", "quarter"] as GraphMode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`tab-btn capitalize ${mode === m ? "tab-btn-active" : ""}`}>
                  {m === "day" ? "Day" : m === "month" ? "Month" : "Quarter"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-800 p-1 ml-auto">
              {(["AED", "USD"] as DisplayCurrency[]).map((c) => (
                <button key={c} onClick={() => setDisplay(c)}
                  className={`tab-btn ${display === c ? "tab-btn-active" : ""}`}>{c}</button>
              ))}
            </div>
          </div>
          {/* PC rate line (unchanged). Mobile: plain text between balance and graph. */}
          <div className="text-xs text-slate-400 dark:text-zinc-500 mb-2 max-md:order-1 max-md:mb-0 max-md:px-1">
            Rate: 1 USD = {rate} AED <span className="opacity-70">(change it in Settings)</span>
          </div>
          {/* PC graph (unchanged) */}
          <div className="max-md:hidden">
            <AccountsGraph transactions={transactions} rate={rate} display={display} mode={mode} vatExclusions={activeRules} />
          </div>
          {/* Mobile graph card: controls + plot + tap detail card.
              AED/USD picker sits on top of Day/Month/Quarter. */}
          <div className="md:hidden card order-2 flex flex-col gap-2 max-md:!px-3">
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 dark:border-zinc-800 p-1">
              {(["AED", "USD"] as DisplayCurrency[]).map((c) => (
                <button key={c} onClick={() => setDisplay(c)}
                  className={`tab-btn !px-2 text-center ${display === c ? "tab-btn-active" : ""}`}>{c}</button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 dark:border-zinc-800 p-1">
              {(["day", "month", "quarter"] as GraphMode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`tab-btn capitalize !px-2 text-center ${mode === m ? "tab-btn-active" : ""}`}>
                  {m === "day" ? "Day" : m === "month" ? "Month" : "Quarter"}
                </button>
              ))}
            </div>
            <AccountsGraph transactions={transactions} rate={rate} display={display} mode={mode} vatExclusions={activeRules} />
          </div>
        </div>
      </div>
      ) : tab === "vat" ? (
      <div className="flex flex-col gap-4">
        <div className="card">
          <h2 className="text-base font-semibold mb-1">VAT Filings</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mb-3">
            Quarterly VAT figures in AED. Credits and Debits are the Quarter graph inflows/outflows minus transactions covered by your VAT exclusion rules, with VAT removed (÷1.05); VAT Due matches the Quarter graph's VAT line.
          </p>
          <div className="card !p-0 overflow-x-auto max-md:hidden">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200 dark:border-zinc-800">
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 font-medium text-right">Credits</th>
                <th className="px-4 py-2 font-medium text-right">Debits</th>
                <th className="px-4 py-2 font-medium text-right">VAT Due</th>
              </tr></thead>
              <tbody>
                {vatFilings.map((f) => (
                  <tr key={f.key} className="table-row">
                    <td className="px-4 py-2 font-medium whitespace-nowrap">{f.period}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-right text-green-600 dark:text-green-400">{money(f.credits, "AED")}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-right text-red-600 dark:text-red-400">{money(f.debits, "AED")}</td>
                    <td className={`px-4 py-2 whitespace-nowrap text-right font-semibold ${f.vatDue >= 0 ? "text-amber-600 dark:text-amber-400" : "text-amber-600/70 dark:text-amber-400/70"}`}>{money(f.vatDue, "AED")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!vatFilings.length && <div className="p-6 text-center text-sm text-slate-400">No transactions yet.</div>}
          </div>
          {/* Mobile VAT filings: one compact card per quarter — no table, no h-scroll */}
          <div className="md:hidden space-y-2">
            {vatFilings.map((f) => (
              <div key={f.key} className="card !rounded-xl !p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{f.period}</span>
                  <span className={`text-sm font-semibold whitespace-nowrap ${f.vatDue >= 0 ? "text-amber-600 dark:text-amber-400" : "text-amber-600/70 dark:text-amber-400/70"}`}>{money(f.vatDue, "AED")}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                  <span className="text-green-600 dark:text-green-400 font-medium truncate">▲ {money(f.credits, "AED")}</span>
                  <span className="text-red-600 dark:text-red-400 font-medium truncate">▼ {money(f.debits, "AED")}</span>
                </div>
              </div>
            ))}
            {!vatFilings.length && <div className="card text-center text-sm text-slate-400">No transactions yet.</div>}
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Transactions whose description contains an enabled string (case-sensitive) are ignored in the VAT calculations — the VAT line and the Credits/Debits columns.
        </p>
        <ExclusionSection side="inflow" title="Inflow Exclusions" hint="Matching credits are left out of VAT." exclusions={exclusions} onChanged={loadExclusions} />
        <ExclusionSection side="outflow" title="Outflow Exclusions" hint="Matching debits are left out of VAT." exclusions={exclusions} onChanged={loadExclusions} />
      </div>
      ) : (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 max-md:flex-col max-md:items-stretch">
          <input className="input max-w-md flex-1 min-w-[240px] max-md:max-w-none" placeholder="Search description, tag, amount (±100), or date (e.g. Jun 30, 2026)…"
            value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search transactions" />
          {!!checkedIds.size && (
            <>
              {/* PC bulk row (unchanged) */}
              <div className="items-center gap-2 max-md:hidden flex flex-wrap">
              <span className="text-xs text-slate-500 dark:text-zinc-400 whitespace-nowrap">{checkedIds.size} selected</span>
              <TagDropdown options={TRANSACTION_TAGS} onSelect={bulkModifyTag}
                placeholder="Modify tags…" pillClass={transactionTagClasses}
                triggerClass="!w-auto !h-7 !py-0 text-xs" disabled={bulkBusy}
                title="Adds the tag to all selected transactions — or removes it if every selected already has it" />
              <select className="input !w-auto !h-7 !py-0 text-xs" value="" disabled={bulkBusy} title="Link selected transactions to a person"
                onChange={(e) => { const v = e.target.value; e.target.value = ""; bulkLink("contactId", v); }}>
                <option value="">Link Person…</option>
                {peopleList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="input !w-auto !h-7 !py-0 text-xs" value="" disabled={bulkBusy} title="Link selected transactions to a project"
                onChange={(e) => { const v = e.target.value; e.target.value = ""; bulkLink("projectId", v); }}>
                <option value="">Link Project…</option>
                {projectsList.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <button className="btn !h-7 !py-0 px-3 text-xs" disabled={bulkBusy} onClick={bulkExclude} title="Add selected descriptions to VAT exclusions">
                {bulkBusy ? "Working…" : "Add to Exclusions"}
              </button>
              <button className="btn !h-7 !py-0 px-3 text-xs !bg-red-600 hover:!bg-red-700 !text-white" disabled={bulkBusy} onClick={bulkDelete} title="Delete selected transactions">
                {bulkBusy ? "Working…" : "Delete"}
              </button>
              <button className="btn-ghost text-xs" disabled={bulkBusy} onClick={() => { setCheckedIds(new Set()); setBulkMsg(""); }} title="Clear selection">✕ Clear</button>
              </div>
              {/* Mobile bulk column: full-width stacked controls */}
              <div className="md:hidden flex flex-col gap-2 w-full">
                <div className="text-xs text-slate-500 dark:text-zinc-400 text-center">{checkedIds.size} selected</div>
                <TagDropdown className="w-full" options={TRANSACTION_TAGS} onSelect={bulkModifyTag}
                  placeholder="Modify tags…" pillClass={transactionTagClasses}
                  triggerClass="!w-full !h-7 !py-0 text-xs" disabled={bulkBusy}
                  title="Adds the tag to all selected transactions — or removes it if every selected already has it" />
                <select className="input !w-full !h-7 !py-0 text-xs" value="" disabled={bulkBusy} title="Link selected transactions to a person"
                  onChange={(e) => { const v = e.target.value; e.target.value = ""; bulkLink("contactId", v); }}>
                  <option value="">Link Person…</option>
                  {peopleList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select className="input !w-full !h-7 !py-0 text-xs" value="" disabled={bulkBusy} title="Link selected transactions to a project"
                  onChange={(e) => { const v = e.target.value; e.target.value = ""; bulkLink("projectId", v); }}>
                  <option value="">Link Project…</option>
                  {projectsList.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
                <button className="btn !h-7 !py-0 px-3 text-xs w-full" disabled={bulkBusy} onClick={bulkExclude} title="Add selected descriptions to VAT exclusions">
                  {bulkBusy ? "Working…" : "Add to Exclusions"}
                </button>
                <button className="btn !h-7 !py-0 px-3 text-xs !bg-red-600 hover:!bg-red-700 !text-white w-full" disabled={bulkBusy} onClick={bulkDelete} title="Delete selected transactions">
                  {bulkBusy ? "Working…" : "Delete"}
                </button>
                <button className="btn-ghost text-xs w-full rounded-xl border border-slate-200 dark:border-zinc-700" disabled={bulkBusy} onClick={() => { setCheckedIds(new Set()); setBulkMsg(""); }} title="Clear selection">Cancel</button>
              </div>
            </>
          )}
        </div>
        {!!bulkMsg && <div className="text-xs text-slate-500 dark:text-zinc-400">{bulkMsg}</div>}
        {/* PC: transactions table (unchanged). Mobile: compact cards — no h-scroll, no wrap. */}
        <div className="card !p-0 overflow-x-auto max-md:hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200 dark:border-zinc-800">
            <th className="px-3 py-2 w-8">
              <input type="checkbox" checked={allShownChecked} onChange={toggleSelectAll}
                className="cbx" title="Select all shown transactions" aria-label="Select all shown transactions" />
            </th>
            <th className="px-4 py-2 font-medium">Description</th>
            <th className="px-4 py-2 font-medium">Amount</th>
            <th className="px-4 py-2 font-medium">
              <button type="button" onClick={toggleCurrencySort} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-zinc-200" title="Cycle currency order">
                Currency <span className="text-[10px] w-3 inline-block text-center">{currencySort === "AED" ? "▼" : currencySort === "USD" ? "▲" : ""}</span>
              </button>
            </th>
            <th className="px-4 py-2 font-medium">
              <button type="button" onClick={toggleDateSort} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-zinc-200" title="Toggle date order">
                Date <span className="text-[10px]">{dateSort === "desc" ? "▼" : "▲"}</span>
              </button>
            </th>
            <th className="px-4 py-2 font-medium">Balance</th>
          </tr></thead>
          <tbody>
            {sortedTransactions.map((transaction) => (
              <tr key={transaction.id} onClick={() => setSelected(transaction)}
                className={`table-row cursor-pointer ${isVatExcluded(transaction, exclusions) ? "bg-brand-500/[0.06] dark:bg-brand-500/[0.10]" : ""}`}>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={checkedIds.has(transaction.id)} onChange={() => toggleChecked(transaction.id)}
                    className="cbx" aria-label={`Select ${transaction.description || "transaction"}`} />
                </td>
                <td className="px-4 py-2">
                  <span className="font-medium">{transaction.description || "—"}</span>
                  {parseTransactionTags(transaction.tags).map((tag) => (
                    <span key={tag} className={`inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-semibold leading-tight ml-1.5 align-middle ${transactionTagClasses(tag)}`}>{tag}</span>
                  ))}
                </td>
                <td className={`px-4 py-2 whitespace-nowrap font-medium ${transaction.amount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {money(Math.abs(transaction.amount), "")}
                </td>
                <td className={`px-4 py-2 whitespace-nowrap font-medium ${transaction.currency === "AED" ? "text-yellow-600 dark:text-yellow-400" : "text-blue-600 dark:text-blue-400"}`}>
                  {transaction.currency}
                </td>
                <td className="px-4 py-2 text-slate-500 dark:text-zinc-400 whitespace-nowrap">{dateLabel(transaction.transactionDate)}</td>
                <td className="px-4 py-2 text-slate-500 dark:text-zinc-400 whitespace-nowrap">{money(transaction.balance, transaction.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!transactions.length && <div className="p-8 text-center text-sm text-slate-500 dark:text-zinc-400">No transactions yet. Upload a bank statement CSV to get started.</div>}
        {!!transactions.length && !sortedTransactions.length && <div className="p-8 text-center text-sm text-slate-500 dark:text-zinc-400">No transactions match “{search}”.</div>}
        </div>
        {/* Mobile transactions: one fixed-height card per row — description
            truncates, amount/date on one line, so rows never wrap unevenly. */}
        <div className="md:hidden space-y-2">
          <div className="card !rounded-xl !p-3 flex items-center gap-2">
            <input type="checkbox" checked={allShownChecked} onChange={toggleSelectAll}
              className="cbx" title="Select all shown transactions" aria-label="Select all shown transactions" />
            <span className="text-xs text-slate-500 dark:text-zinc-400">Select all</span>
            <span className="ml-auto flex items-center gap-1">
              <button type="button" onClick={toggleDateSort} className="btn-ghost !px-2 !py-1 text-xs" title="Toggle date order">
                Date {dateSort === "desc" ? "▼" : "▲"}
              </button>
              <button type="button" onClick={toggleCurrencySort} className="btn-ghost !px-2 !py-1 text-xs" title="Cycle currency order">
                {currencySort || "Cur"} {currencySort === "AED" ? "▼" : currencySort === "USD" ? "▲" : ""}
              </button>
            </span>
          </div>
          {sortedTransactions.map((transaction) => {
            const checked = checkedIds.has(transaction.id);
            return (
              <div key={transaction.id} onClick={() => setSelected(transaction)}
                className={`card !rounded-xl !p-3 cursor-pointer ${checked ? "!border-brand-500 ring-2 ring-brand-500/30" : ""} ${isVatExcluded(transaction, exclusions) ? "bg-brand-500/[0.04] dark:bg-brand-500/[0.08]" : ""}`}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={checked} onChange={() => toggleChecked(transaction.id)}
                    onClick={(e) => e.stopPropagation()} className="cbx shrink-0" aria-label={`Select ${transaction.description || "transaction"}`} />
                  <span className="font-medium text-sm truncate flex-1 min-w-0">{transaction.description || "—"}</span>
                  <span className={`text-sm font-semibold whitespace-nowrap shrink-0 ${transaction.amount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {transaction.amount >= 0 ? "+" : "−"}{money(Math.abs(transaction.amount), "")}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 pl-6 text-xs text-slate-500 dark:text-zinc-400">
                  <span className={`font-medium shrink-0 ${transaction.currency === "AED" ? "text-yellow-600 dark:text-yellow-400" : "text-blue-600 dark:text-blue-400"}`}>{transaction.currency}</span>
                  <span className="shrink-0">·</span>
                  <span className="shrink-0">{dateLabel(transaction.transactionDate)}</span>
                  {parseTransactionTags(transaction.tags).slice(0, 2).map((tag) => (
                    <span key={tag} className={`inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-semibold leading-tight truncate ${transactionTagClasses(tag)}`}>{tag}</span>
                  ))}
                  {/* Running balance: tiny, bottom-right under the amount */}
                  <span className="ml-auto shrink-0 tabular-nums text-xs text-slate-500 dark:text-zinc-400">
                    {money(transaction.balance, "")}
                  </span>
                </div>
              </div>
            );
          })}
          {!transactions.length && <div className="card text-center text-sm text-slate-500 dark:text-zinc-400">No transactions yet. Upload a bank statement CSV to get started.</div>}
          {!!transactions.length && !sortedTransactions.length && <div className="card text-center text-sm text-slate-500 dark:text-zinc-400">No transactions match “{search}”.</div>}
        </div>
      </div>
      )}
      {selected && <TransactionDrawer key={selected.id} transaction={selected} onClose={() => setSelected(null)} exclusions={exclusions} onChanged={loadExclusions} onTagsChanged={load} />}
    </Shell>
  );
}

function ExclusionSection({ side, title, hint, exclusions, onChanged }: {
  side: "inflow" | "outflow";
  title: string;
  hint: string;
  exclusions: VatExclusion[];
  onChanged: () => void;
}) {
  const rows = exclusions.filter((e) => e.side === side);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function add() {
    const pattern = draft.trim();
    if (!pattern || busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/vat-exclusions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side, pattern }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not save exclusion.");
      setDraft(""); setAdding(false);
      onChanged();
    } catch (e: any) { setErr(e?.message || "Could not save exclusion."); }
    finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-slate-400 dark:text-zinc-500">{hint}</p>
        </div>
        {!adding && (
          <button className="btn !py-1.5 flex items-center gap-1.5 text-xs" onClick={() => { setAdding(true); setErr(""); }}>
            <IconPlus /> Add
          </button>
        )}
      </div>
      {adding && (
        <div className="flex items-center gap-2 mt-3 max-md:flex-col max-md:items-stretch">
          <input className="input" autoFocus placeholder="e.g. Salary" value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") { setAdding(false); setDraft(""); } }} />
          <button className="btn !py-1.5 text-xs max-md:w-full" disabled={busy || !draft.trim()} onClick={add}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="btn-ghost text-xs max-md:w-full" onClick={() => { setAdding(false); setDraft(""); setErr(""); }}>Cancel</button>
        </div>
      )}
      {err && <div className="text-xs text-red-500 mt-2">{err}</div>}
      <div className="flex flex-col mt-2">
        {!rows.length && !adding && (
          <div className="text-xs text-slate-400 dark:text-zinc-500 py-2">No exclusions yet.</div>
        )}
        {rows.map((rule) => (
          <ExclusionRow key={rule.id} rule={rule} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}

function ExclusionRow({ rule, onChanged }: { rule: VatExclusion; onChanged: () => void }) {
  const [text, setText] = useState(rule.pattern);
  const [busy, setBusy] = useState(false);

  async function patch(data: object) {
    setBusy(true);
    try {
      const r = await fetch(`/api/vat-exclusions/${rule.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Update failed.");
      onChanged();
    } catch {
      setText(rule.pattern); // revert on failure
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm(`Delete exclusion "${rule.pattern}"?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/vat-exclusions/${rule.id}`, { method: "DELETE" });
      onChanged();
    } finally { setBusy(false); }
  }

  async function commit() {
    const next = text.trim();
    if (next && next !== rule.pattern) await patch({ pattern: next });
    else setText(rule.pattern);
  }

  return (
    <div className={`flex items-center gap-2 py-1.5 ${rule.enabled ? "" : "opacity-55"}`}>
      <input
        className="input !py-1.5 !rounded-full flex-1 min-w-0"
        value={text}
        disabled={busy}
        aria-label="Exclusion string"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={async (e) => {
          if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
          if (e.key === "Escape") { setText(rule.pattern); (e.target as HTMLInputElement).blur(); }
        }}
      />
      <button
        role="switch" aria-checked={rule.enabled} title={rule.enabled ? "Disable" : "Enable"}
        disabled={busy}
        onClick={() => patch({ enabled: !rule.enabled })}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${rule.enabled ? "bg-brand-500" : "bg-slate-300 dark:bg-zinc-700"}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${rule.enabled ? "left-[18px]" : "left-0.5"}`} />
      </button>
      <button className="icon-btn text-red-500" title="Delete" disabled={busy} onClick={remove}>
        <IconTrash />
      </button>
    </div>
  );
}



