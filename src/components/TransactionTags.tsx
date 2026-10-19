"use client";

/** Transaction categories (multi-tag per transaction). Stored as a JSON
 *  string array in Transaction.tags ("[]"), so one transaction can carry
 *  several tags and same-description rows stay in sync via bulk update. */
export const TRANSACTION_TAGS = [
  "Revenue",
  "Fees",
  "Project",
  "Expense",
  "Food",
  "Fuel",
  "Salary",
  "Parking",
  "Transfer",
  "Tax",
] as const;
export type TransactionTag = (typeof TRANSACTION_TAGS)[number];

const TAG_SET = new Set<string>(TRANSACTION_TAGS as readonly string[]);

/** Parse the stored JSON tags value into a clean string array. */
export function parseTransactionTags(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return [...new Set(v.filter((t): t is string => typeof t === "string" && TAG_SET.has(t)))];
  } catch {
    return [];
  }
}

export function stringifyTransactionTags(tags: string[]): string {
  return JSON.stringify([...new Set(tags.filter((t) => TAG_SET.has(t)))]);
}

export function isTransactionTag(t: string): boolean {
  return TAG_SET.has(t);
}

/** Pill colors per category: money-in greens, money-out reds/oranges,
 *  neutral logistics in blue/purple/slate. */
export function transactionTagClasses(tag: string): string {
  switch (tag) {
    case "Revenue":
      return "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30";
    case "Fees":
      return "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30";
    case "Project":
      return "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30";
    case "Expense":
      return "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30";
    case "Food":
      return "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30";
    case "Fuel":
      return "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-500/30";
    case "Salary":
      return "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30";
    case "Parking":
      return "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30";
    case "Transfer":
      return "bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30";
    case "Tax":
      return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";
    default:
      return "";
  }
}
