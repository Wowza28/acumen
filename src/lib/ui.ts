/** Shared formatting utilities used across Accounts and component drawers. */

export function money(value: number | null | undefined, currency: string) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  const abs = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Keep negatives visible ("AED -1,234.56" — sign after the currency, before
  // the number) e.g. a VAT refund quarter. Callers that want a plain
  // magnitude (like a colour-coded amount column) pass Math.abs themselves.
  const sign = n < 0 ? "-" : "";
  return currency ? `${currency} ${sign}${abs}` : `${sign}${abs}`;
}

export function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return isNaN(+date) ? "—" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
