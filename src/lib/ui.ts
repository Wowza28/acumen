/** Shared formatting utilities used across Accounts and component drawers. */

export function money(value: number | null | undefined, currency: string) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Math.abs(Number(value)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${n}` : n;
}

export function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return isNaN(+date) ? "—" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
