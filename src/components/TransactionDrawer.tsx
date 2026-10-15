"use client";

import { useEffect, useState } from "react";
import SlideOver from "@/components/SlideOver";
import { TRANSACTION_TAGS, parseTransactionTags, transactionTagClasses } from "@/components/TransactionTags";
import TagDropdown from "@/components/TagDropdown";
import type { Transaction, VatExclusion } from "@/lib/types";

// Style + formatting helpers shared by the Accounts page.
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

/**
 * Right-sidebar drawer shown when a linked transaction is clicked.
 * Reusable across the Accounts, People and Project pages: the last three
 * props are optional with safe no-op defaults so the drawer works where
 * VAT exclusions / tag reloads aren't applicable.
 */
export default function TransactionDrawer({
  transaction,
  onClose,
  exclusions = [],
  onChanged = () => {},
  onTagsChanged = () => {}
}: {
  transaction: Transaction;
  onClose: () => void;
  exclusions?: VatExclusion[];
  onChanged?: () => void;
  onTagsChanged?: () => void;
}) {
  const [excBusy, setExcBusy] = useState(false);
  const [excMsg, setExcMsg] = useState("");
  const [tags, setTags] = useState<string[]>(() => parseTransactionTags(transaction.tags));
  const [tagBusy, setTagBusy] = useState(false);
  const [tagMsg, setTagMsg] = useState("");
  const [siblingCount, setSiblingCount] = useState<number | null>(null);
  const [links, setLinks] = useState<Array<{ id: string; contactId?: string | null; projectId?: string | null; contact?: { id: string; name: string } | null; project?: { id: string; title: string } | null }>>([]);
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; title: string }>>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const alreadyExcluded = isVatExcluded(transaction, exclusions);

  useEffect(() => {
    let alive = true;
    setTags(parseTransactionTags(transaction.tags));
    setTagMsg("");
    // Count same-description siblings so the drawer can say how many rows a
    // tag change will propagate to (exact description match, like the API).
    fetch(`/api/transaction-tags/count?description=${encodeURIComponent(transaction.description || "")}`)
      .then((r) => r.json())
      .then((j) => { if (alive && typeof j?.count === "number") setSiblingCount(j.count); })
      .catch(() => {});
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

  const currentContactId = links.find((l) => l.contactId)?.contactId || "";
  const currentProjectId = links.find((l) => l.projectId)?.projectId || "";

  /** Single-select linking (matches the Note/Task editors): normalize this
   *  transaction's links to at most one row carrying the chosen person + project. */
  async function setLinked(field: "contactId" | "projectId", value: string) {
    if (linkBusy) return;
    const prev = field === "contactId" ? currentContactId : currentProjectId;
    if (prev === value) return;
    const nextContact = field === "contactId" ? value : currentContactId;
    const nextProject = field === "projectId" ? value : currentProjectId;
    setLinkBusy(true);
    try {
      for (const l of links) {
        await fetch(`/api/transaction-links?id=${encodeURIComponent(l.id)}`, { method: "DELETE" });
      }
      if (nextContact || nextProject) {
        await fetch("/api/transaction-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactionId: transaction.id,
            ...(nextContact ? { contactId: nextContact } : {}),
            ...(nextProject ? { projectId: nextProject } : {}),
          }),
        });
      }
      await refreshLinks();
    } finally { setLinkBusy(false); }
  }
  async function applyTags(next: string[]) {
    if (tagBusy) return;
    const description = (transaction.description || "").trim();
    if (!description) { setTagMsg("No description on this transaction — cannot propagate."); return; }
    setTagBusy(true); setTagMsg("");
    try {
      const r = await fetch("/api/transaction-tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: transaction.description, set: next }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not save tags.");
      setTags(next);
      const n = typeof j.updated === "number" ? j.updated : null;
      setTagMsg(n != null ? `Applied to ${n} transaction${n === 1 ? "" : "s"} with this description.` : "Tags saved.");
      onTagsChanged();
    } catch (e: any) { setTagMsg(e?.message || "Could not save tags."); }
    finally { setTagBusy(false); }
  }

  async function deleteOne() {
    if (delBusy) return;
    const label = transaction.description || "this transaction";
    if (!confirm(`Delete "${label}"? This removes only this transaction and cannot be undone.`)) return;
    setDelBusy(true);
    try {
      const r = await fetch("/api/transactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [transaction.id] }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not delete the transaction.");
      onTagsChanged();
      onClose();
    } catch (e: any) {
      alert(e?.message || "Could not delete the transaction.");
    } finally { setDelBusy(false); }
  }

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
          <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-zinc-500 mb-1">Person</div>
          <select className="input !py-1.5 text-xs" value={currentContactId} disabled={linkBusy}
            onChange={(e) => setLinked("contactId", e.target.value)}>
            <option value="">— none —</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-zinc-500 mb-1 mt-3">Project</div>
          <select className="input !py-1.5 text-xs" value={currentProjectId} disabled={linkBusy}
            onChange={(e) => setLinked("projectId", e.target.value)}>
            <option value="">— none —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-zinc-500 mb-1">Tags</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.length ? tags.map((tag) => (
              <button key={tag} type="button" title={`Remove ${tag}`}
                disabled={tagBusy}
                onClick={() => applyTags(tags.filter((t) => t !== tag))}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold hover:opacity-70 ${transactionTagClasses(tag)}`}>
                {tag}<span aria-hidden>✕</span>
              </button>
            )) : <span className="text-xs text-slate-400 dark:text-zinc-500">No tags yet.</span>}
          </div>
          <div className="flex gap-1.5">
            <TagDropdown className="flex-1"
              options={TRANSACTION_TAGS.filter((t) => !tags.includes(t))}
              onSelect={(t) => { if (!tags.includes(t)) applyTags([...tags, t]); }}
              placeholder="＋ Add a tag…"
              pillClass={transactionTagClasses}
              triggerClass="!py-1 text-xs"
              disabled={tagBusy}
              title="Add a tag"
            />
          </div>
          <div className="text-[11px] mt-1.5 text-slate-500 dark:text-zinc-400">
            {siblingCount != null && siblingCount > 1
              ? `Tags apply to all ${siblingCount} transactions with this exact description.`
              : "Tags apply to every transaction with this exact description."}
          </div>
          {tagMsg && <div className="text-xs mt-1 text-slate-500 dark:text-zinc-400">{tagMsg}</div>}
        </div>
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
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
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
          <button
            className="btn !py-1.5 text-xs w-full !bg-red-600 hover:!bg-red-700 !text-white"
            disabled={delBusy}
            title="Delete this transaction"
            onClick={deleteOne}
          >
            {delBusy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </SlideOver>
  );
}

