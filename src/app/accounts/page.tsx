"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Shell from "@/components/Shell";
import PageHeader from "@/components/PageHeader";
import SlideOver from "@/components/SlideOver";
import { IconUpload, IconPlus, IconTrash, IconPencil, IconCheck, IconX, IconPeople, IconProject } from "@/components/icons";
import AccountsGraph, { buildBuckets, type DisplayCurrency, type GraphMode, type VatExclusionRule } from "@/components/AccountsGraph";

type VatExclusion = { id: string; side: string; pattern: string; enabled: boolean };

type Transaction = {
  id: string; currency: string; transactionType: string; transactionDate: string;
  referenceNumber: string; description: string; amount: number;
  balance: number | null; notes: string | null;
};

function money(value: number | null | undefined, currency: string) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Math.abs(Number(value)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${n}` : n;
}
function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return isNaN(+date) ? "—" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** True when a transaction is ignored for VAT by an enabled exclusion rule
 *  (case-sensitive description substring, matched on the correct side). */
function isVatExcluded(t: { amount: number; description?: string | null }, exclusions: VatExclusion[]) {
  const desc = t.description || "";
  const side = t.amount >= 0 ? "inflow" : "outflow";
  return exclusions.some((e) => e.enabled && e.side === side && e.pattern && desc.includes(e.pattern));
}

/** Search matching for the Transactions tab: description (partial,
 *  case-insensitive), amount (within ±100), or date as displayed
 *  (e.g. "Jun 30, 2026", case-insensitive substring). */
function matchesSearch(t: Transaction, q: string) {
  const query = q.trim();
  if (!query) return true;
  const ql = query.toLowerCase();
  if ((t.description || "").toLowerCase().includes(ql)) return true;
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
      return { key: b.key, period, credits: b.inflow / 1.05, debits: b.outflow / 1.05, vatDue: b.vat || 0 };
    }).reverse(); // newest quarter first
  }, [transactions, rate, activeRules]);

  async function load() {
    const data = await fetch("/api/transactions").then((r) => r.json()).catch(() => []);
    setTransactions(Array.isArray(data) ? data : []);
  }
  useEffect(() => { load(); loadExclusions(); }, []);
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
    const latest = new Map<string, { balance: number; date: number }>();
    for (const t of transactions) {
      if (t.balance == null || !Number.isFinite(Number(t.balance))) continue;
      const cur = (t.currency || "").toUpperCase();
      const d = new Date(t.transactionDate).getTime();
      const prev = latest.get(cur);
      if (!prev || d > prev.date || (d === prev.date)) latest.set(cur, { balance: Number(t.balance), date: isNaN(d) ? 0 : d });
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
      return a.id.localeCompare(b.id);
    });
    return rows;
  }, [transactions, search, currencySort, dateSort]);

  function toggleCurrencySort() {
    setCurrencySort((current) => current === null ? "AED" : current === "AED" ? "USD" : null);
  }
  function toggleDateSort() {
    setDateSort((current) => current === "desc" ? "asc" : "desc");
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
          <button className="btn !py-1.5 flex items-center gap-1.5" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <IconUpload /> {uploading ? "Importing…" : "Upload Statement"}
          </button>
        </div>
      } />
      <div className="mb-4 flex items-center gap-1">
        <button className={`tab-btn ${tab === "graph" ? "tab-btn-active" : ""}`} onClick={() => setTab("graph")}>Summary</button>
        <button className={`tab-btn ${tab === "tx" ? "tab-btn-active" : ""}`} onClick={() => setTab("tx")}>Transactions</button>
        <button className={`tab-btn ${tab === "vat" ? "tab-btn-active" : ""}`} onClick={() => setTab("vat")}>VAT</button>
      </div>
      {message && <div className="mb-3 text-sm text-slate-500 dark:text-zinc-400">{message}</div>}
      {tab === "graph" ? (
      <div className="flex flex-col gap-4">
        {!!subBalances.size && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        )}
        <div className="card">
          <div className="flex flex-wrap items-center gap-2 mb-3">
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
          <div className="text-xs text-slate-400 dark:text-zinc-500 mb-2">
            Rate: 1 USD = {rate} AED <span className="opacity-70">(change it in Settings)</span>
          </div>
          <AccountsGraph transactions={transactions} rate={rate} display={display} mode={mode} vatExclusions={activeRules} />
        </div>
      </div>
      ) : tab === "vat" ? (
      <div className="flex flex-col gap-4">
        <div className="card">
          <h2 className="text-base font-semibold mb-1">VAT Filings</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mb-3">
            Quarterly VAT figures in AED. Credits and Debits are the Quarter graph inflows/outflows with VAT removed (÷1.05); VAT Due matches the Quarter graph's VAT line.
          </p>
          <div className="card !p-0 overflow-x-auto">
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
        </div>
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Transactions whose description contains an enabled string (case-sensitive) are ignored when calculating the VAT line.
        </p>
        <ExclusionSection side="inflow" title="Inflow Exclusions" hint="Matching credits are left out of VAT." exclusions={exclusions} onChanged={loadExclusions} />
        <ExclusionSection side="outflow" title="Outflow Exclusions" hint="Matching debits are left out of VAT." exclusions={exclusions} onChanged={loadExclusions} />
      </div>
      ) : (
      <div className="flex flex-col gap-3">
        <input className="input max-w-md" placeholder="Search description, amount (±100), or date (e.g. Jun 30, 2026)…"
          value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search transactions" />
        <div className="card !p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200 dark:border-zinc-800">
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
                <td className="px-4 py-2 font-medium">{transaction.description || "—"}</td>
                <td className={`px-4 py-2 whitespace-nowrap font-medium ${transaction.amount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {money(transaction.amount, "")}
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
      </div>
      )}
      {selected && <TransactionDrawer transaction={selected} onClose={() => setSelected(null)} exclusions={exclusions} onChanged={loadExclusions} />}
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
        <div className="flex items-center gap-2 mt-3">
          <input className="input" autoFocus placeholder="e.g. Salary" value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") { setAdding(false); setDraft(""); } }} />
          <button className="btn !py-1.5 text-xs" disabled={busy || !draft.trim()} onClick={add}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="btn-ghost text-xs" onClick={() => { setAdding(false); setDraft(""); setErr(""); }}>Cancel</button>
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


function TransactionDrawer({ transaction, onClose, exclusions, onChanged }: {
  transaction: Transaction; onClose: () => void; exclusions: VatExclusion[]; onChanged: () => void;
}) {
  const [excBusy, setExcBusy] = useState(false);
  const [excMsg, setExcMsg] = useState("");
  const [links, setLinks] = useState<Array<{ id: string; contactId?: string | null; projectId?: string | null; contact?: { id: string; name: string } | null; project?: { id: string; title: string } | null }>>([]);
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; title: string }>>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const alreadyExcluded = isVatExcluded(transaction, exclusions);

  useEffect(() => {
    let alive = true;
    fetch(`/api/transaction-links?transactionId=${transaction.id}`).then((r) => r.json()).then((j) => {
      if (alive && Array.isArray(j?.links)) setLinks(j.links);
    }).catch(() => {});
    fetch("/api/contacts").then((r) => r.json()).then((j) => { if (alive && Array.isArray(j)) setPeople(j); }).catch(() => {});
    fetch("/api/projects").then((r) => r.json()).then((j) => { if (alive && Array.isArray(j)) setProjects(j); }).catch(() => {});
    return () => { alive = false; };
  }, [transaction.id]);

  async function refreshLinks() {
    const j = await fetch(`/api/transaction-links?transactionId=${transaction.id}`).then((r) => r.json()).catch(() => null);
    if (Array.isArray(j?.links)) setLinks(j.links);
  }

  async function addLink(field: "contactId" | "projectId", id: string) {
    if (!id) return;
    setLinkBusy(true);
    try {
      await fetch("/api/transaction-links", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: transaction.id, [field]: id }),
      });
      await refreshLinks();
    } finally { setLinkBusy(false); }
  }

  async function removeLink(id: string) {
    setLinkBusy(true);
    try {
      await fetch(`/api/transaction-links?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await refreshLinks();
    } finally { setLinkBusy(false); }
  }

  const linkedContactIds = new Set(links.filter((l) => l.contact).map((l) => l.contactId!));
  const linkedProjectIds = new Set(links.filter((l) => l.project).map((l) => l.projectId!));
  const rows: Array<[string, string]> = [
    ["Currency", transaction.currency],
    ["Transaction type", transaction.transactionType || "—"],
    ["Transaction date", dateLabel(transaction.transactionDate)],
    ["Reference number", transaction.referenceNumber || "—"],
    ["Description", transaction.description || "—"],
    ["Amount", money(transaction.amount, transaction.currency)],
    ["Balance after transaction", money(transaction.balance, transaction.currency)],
    ["Notes", transaction.notes || "—"],
  ];
  return (
    <SlideOver onClose={onClose} width="max-w-[440px]" label="Transaction"
      title={transaction.description || "Transaction details"}>
      <div className="flex flex-col gap-4">
        {alreadyExcluded && (
          <div className="text-xs rounded-xl px-3 py-2 bg-brand-500/10 text-brand-700 dark:text-brand-300">
            VAT-excluded by a matching rule — ignored in the quarterly VAT line.
          </div>
        )}
        {rows.map(([label, value]) => (
          <div key={label}>
            <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-zinc-500 mb-1">{label}</div>
            <div className={`text-sm whitespace-pre-wrap break-words ${label === "Amount" ? (transaction.amount >= 0 ? "font-medium text-green-600 dark:text-green-400" : "font-medium text-red-600 dark:text-red-400") : "text-slate-800 dark:text-zinc-200"}`}>
              {value}
            </div>
          </div>
        ))}
        <div>
          <button
            className="btn !py-1.5 text-xs w-full"
            disabled={excBusy || alreadyExcluded || !(transaction.description || "").trim()}
            title={alreadyExcluded ? "Already covered by an exclusion rule" : "Add this description to VAT Exclusions"}
            onClick={async () => {
              const pattern = (transaction.description || "").trim();
              if (!pattern || excBusy) return;
              setExcBusy(true); setExcMsg("");
              try {
                const r = await fetch("/api/vat-exclusions", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ side: transaction.amount >= 0 ? "inflow" : "outflow", pattern }),
                });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(j.error || "Could not save exclusion.");
                setExcMsg(`Added to ${transaction.amount >= 0 ? "Inflow" : "Outflow"} Exclusions.`);
                onChanged();
              } catch (e: any) { setExcMsg(e?.message || "Could not save exclusion."); }
              finally { setExcBusy(false); }
            }}
          >
            {excBusy ? "Adding…" : alreadyExcluded ? "Already Excluded" : "Add to Exclusions"}
          </button>
          {excMsg && <div className="text-xs mt-1.5 text-slate-500 dark:text-zinc-400">{excMsg}</div>}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-zinc-500 mb-1">Linked to</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {links.flatMap((l) => {
              const chips: React.ReactNode[] = [];
              if (l.contact) chips.push(
                <span key={`${l.id}-c`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-zinc-800 pl-2 pr-1 py-0.5 text-xs">
                  <IconPeople className="w-3.5 h-3.5" />
                  <span className="max-w-[18ch] truncate">{l.contact.name}</span>
                  <button className="icon-btn !p-0.5" title="Remove link" disabled={linkBusy} onClick={() => removeLink(l.id)}><IconX className="w-3 h-3" /></button>
                </span>
              );
              if (l.project) chips.push(
                <span key={`${l.id}-p`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-zinc-800 pl-2 pr-1 py-0.5 text-xs">
                  <IconProject className="w-3.5 h-3.5" />
                  <span className="max-w-[18ch] truncate">{l.project.title}</span>
                  <button className="icon-btn !p-0.5" title="Remove link" disabled={linkBusy} onClick={() => removeLink(l.id)}><IconX className="w-3 h-3" /></button>
                </span>
              );
              return chips;
            })}
            {!links.length && <span className="text-slate-400 dark:text-zinc-500 text-xs">Not linked to anyone yet.</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            <select className="input !py-1 text-xs" value="" disabled={linkBusy} onChange={(e) => addLink("contactId", e.target.value)}>
              <option value="">＋ Link a person…</option>
              {people.filter((p) => !linkedContactIds.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="input !py-1 text-xs" value="" disabled={linkBusy} onChange={(e) => addLink("projectId", e.target.value)}>
              <option value="">＋ Link a project…</option>
              {projects.filter((p) => !linkedProjectIds.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
        </div>
      </div>
    </SlideOver>
  );
}

