"use client";

export const STATUS = ["todo", "in-progress", "done"] as const;
export const PRIORITY = ["low", "medium", "high"] as const;

// Project lifecycle statuses (colored tags). Values stored in Project.status.
export const PROJECT_STATUS = ["planned", "active", "complete", "abandoned"] as const;
export const PROJECT_STATUS_LABEL: Record<string, string> = {
  "planned": "Planned",
  "active": "Active",
  "complete": "Complete",
  "abandoned": "Abandoned",
};
export const PROJECT_STATUS_STYLE: Record<string, string> = {
  "planned": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "active": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  "complete": "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "abandoned": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

// Money in AED, e.g. 125000 -> "AED 125,000". Blank for null/undefined.
export function fmtAED(n?: number | null): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  return "AED " + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export const STATUS_STYLE: Record<string, string> = {
  "todo": "bg-slate-200 text-slate-700 dark:bg-zinc-700 dark:text-zinc-200",
  "in-progress": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  "done": "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
};
export const PRIORITY_STYLE: Record<string, string> = {
  "low": "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "medium": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  "high": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
};

export function Tag({ v, map }: { v: string; map: Record<string, string> }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[v] || ""}`}>{v}</span>;
}

// Colored status pill for projects — renders the human label (e.g. "Active").
export function ProjectStatusTag({ status }: { status?: string }) {
  const s = status || "planned";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PROJECT_STATUS_STYLE[s] || "bg-slate-200 text-slate-700 dark:bg-zinc-700 dark:text-zinc-200"}`}>
      {PROJECT_STATUS_LABEL[s] || s}
    </span>
  );
}

export function fmtDue(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(+dt) ? "—" : dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
