"use client";
import { useState } from "react";
import { IconProject, IconMeeting, IconTask, IconNote, IconPeople, IconFile, IconAccounts, IconSearch } from "@/components/icons";

const MAP: Record<string, any> = {
  projects: IconProject,
  meetings: IconMeeting,
  tasks: IconTask,
  notes: IconNote,
  people: IconPeople,
  files: IconFile,
  accounts: IconAccounts
};

export default function PageHeader({ icon, title, count, right, search, actions }: {
  icon: keyof typeof MAP;
  title: string;
  count?: number;
  /** Legacy inline right cluster — rendered as-is (both breakpoints). Used by
   *  pages that haven't adopted the responsive search/actions pattern yet. */
  right?: React.ReactNode;
  /** Responsive search field. On desktop it renders inline before `actions`;
   *  on mobile it collapses to a magnifier icon that expands a full-width bar. */
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  /** Buttons/actions: inline next to the search on desktop, moved to their own
   *  row below the title on mobile. */
  actions?: React.ReactNode;
}) {
  const Icon = MAP[icon];
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2 min-w-0">
          <span className="text-brand-500 dark:text-brand-400 shrink-0"><Icon /></span>
          <span className="truncate">{title}</span>
          {typeof count === "number" ? <span className="text-slate-400 font-normal shrink-0">({count})</span> : null}
        </h1>

        {/* Legacy path (no responsive search): unchanged single-row right cluster */}
        {(!search && right) && right}

        {/* Desktop (md+): inline search input + actions, exactly as before */}
        {search && (
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <input className="input !w-48" placeholder={search.placeholder || "Search…"}
              value={search.value} onChange={(e) => search.onChange(e.target.value)} />
            {actions}
          </div>
        )}

        {/* Mobile: magnifier icon toggles a header-wide search bar below */}
        {search && (
          <button className="icon-btn md:hidden shrink-0" title="Search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setSearchOpen((o) => !o)}>
            <IconSearch />
          </button>
        )}
      </div>

      {/* Mobile: expanded, header-wide search bar. Collapses on blur when the
          user cleared it and taps elsewhere. */}
      {search && searchOpen && (
        <div className="mt-2 md:hidden">
          <input autoFocus className="input w-full" placeholder={search.placeholder || "Search…"}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            onBlur={() => { if (!search.value) setSearchOpen(false); }} />
        </div>
      )}

      {/* Mobile: actions get their own full-width row below the title / search */}
      {search && actions && (
        <div className="mt-2 grid grid-cols-2 gap-2 md:hidden">{actions}</div>
      )}
    </div>
  );
}
