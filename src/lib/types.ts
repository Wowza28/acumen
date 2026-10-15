/** Types shared across the Accounts and people/project pages. */

export type VatExclusion = {
  id: string;
  side: string;
  pattern: string;
  enabled: boolean;
};

/** Full transaction record (as returned by the API / used in the right sidebar). */
export type Transaction = {
  id: string;
  currency: string;
  transactionType: string;
  transactionDate: string;
  referenceNumber: string;
  description: string;
  amount: number;
  balance: number | null;
  notes: string | null;
  tags?: string | null;
};
