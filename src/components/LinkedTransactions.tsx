"use client";
import { useEffect, useState } from "react";

const DEFAULT_RATE = 3.67;

function txAmount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Math.abs(Number(value)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function txDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return isNaN(+date) ? "—" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export type LinkedTx = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  transactionDate: string;
};

/** Shared linked-transactions table (Description / Amount / Currency / Date
 *  + a Total row). The Total converts every transaction to a single display
 *  currency (AED or USD) via the Settings exchange rate, is switchable with a
 *  toggle in the Total row's Currency column, and its Date is the latest
 *  linked transaction. Used by the Person Transactions subtab and the Project
 *  Transactions section. Shows ONLY directly linked transactions — never
 *  anything pulled in via people↔project membership. */
export default function LinkedTransactionsTable({ transactions }: { transactions: LinkedTx[] }) {
  const [rate, setRate] = useState(DEFAULT_RATE);
  const [totalCurrency, setTotalCurrency] = useState<"AED" | "USD">("AED");

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

  if (!transactions.length) return <span className="text-slate-400">No transactions linked.</span>;

  // Convert every transaction into the chosen total currency, then sum.
  const toTotal = (amount: number, currency: string) => {
    const cur = (currency || "").toUpperCase();
    if (totalCurrency === "AED") return cur === "USD" ? amount * rate : amount;
    return cur === "AED" ? amount / rate : amount;
  };
  const total = transactions.reduce((s, t) => s + toTotal(Number(t.amount) || 0, t.currency), 0);
  // Latest linked transaction drives the Total row's Date.
  const latestDate = transactions.reduce((max, t) => {
    const d = new Date(t.transactionDate).getTime();
    return isNaN(d) ? max : Math.max(max, d);
  }, 0);

  return (
    <div className="card !p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200 dark:border-zinc-800">
          <th className="px-4 py-2 font-medium">Description</th>
          <th className="px-4 py-2 font-medium">Amount</th>
          <th className="px-4 py-2 font-medium">Currency</th>
          <th className="px-4 py-2 font-medium">Date</th>
        </tr></thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} className="table-row">
              <td className="px-4 py-2 font-medium">{t.description || "—"}</td>
              <td className={`px-4 py-2 whitespace-nowrap font-medium ${Number(t.amount) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {txAmount(t.amount)}
              </td>
              <td className={`px-4 py-2 whitespace-nowrap font-medium ${t.currency === "AED" ? "text-yellow-600 dark:text-yellow-400" : "text-blue-600 dark:text-blue-400"}`}>
                {t.currency}
              </td>
              <td className="px-4 py-2 text-slate-500 dark:text-zinc-400 whitespace-nowrap">{txDate(t.transactionDate)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-200 dark:border-zinc-700 font-semibold">
            <td className="px-4 py-2">Total</td>
            <td className={`px-4 py-2 whitespace-nowrap ${total >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {txAmount(total)}
            </td>
            <td className="px-4 py-2 whitespace-nowrap">
              <button
                type="button"
                onClick={() => setTotalCurrency(totalCurrency === "AED" ? "USD" : "AED")}
                className={`font-semibold hover:underline ${totalCurrency === "AED" ? "text-yellow-600 dark:text-yellow-400" : "text-blue-600 dark:text-blue-400"}`}
                title="Toggle total currency"
              >
                {totalCurrency}
              </button>
            </td>
            <td className="px-4 py-2 text-slate-500 dark:text-zinc-400 whitespace-nowrap">
              {latestDate ? txDate(new Date(latestDate).toISOString()) : "—"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

