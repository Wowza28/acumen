"use client";
import { IconProject, IconMeeting, IconTask, IconNote, IconPeople, IconFile, IconAccounts } from "@/components/icons";

const MAP: Record<string, any> = {
  projects: IconProject,
  meetings: IconMeeting,
  tasks: IconTask,
  notes: IconNote,
  people: IconPeople,
  files: IconFile,
  accounts: IconAccounts
};

export default function PageHeader({ icon, title, count, right }: { icon: keyof typeof MAP; title: string; count?: number; right?: React.ReactNode }) {
  const Icon = MAP[icon];
  return (
    <div className="flex items-center justify-between mb-4">
      <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
        <span className="text-brand-500 dark:text-brand-400"><Icon /></span> {title}{typeof count === "number" ? <span className="text-slate-400 font-normal">({count})</span> : null}
      </h1>
      {right}
    </div>
  );
}
