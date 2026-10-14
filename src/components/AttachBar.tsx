import { IconClip } from "@/components/icons";
import type { StagedFile } from "@/components/useStagedFiles";
import { useRef } from "react";

export function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return (m ? m[1] : "file").toUpperCase();
}

export default function StagedBar({ staged, onRemove }: { staged: StagedFile[]; onRemove: (id: string) => void }) {
  if (!staged.length) return null;
  return (
    <div className="flex flex-wrap gap-2 px-1 pb-2">
      {staged.map((s) => (
        <div key={s.id} className="flex items-center gap-2 border border-slate-200 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-zinc-800/60 max-w-[220px]">
          <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-700 shrink-0">{extOf(s.file.name)}</span>
          <span className="truncate flex-1" title={s.file.name}>{s.file.name}</span>
          <button className="shrink-0 text-slate-400 hover:text-red-500" title="Remove" onClick={() => onRemove(s.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}

export function PaperclipButton({ onPick }: { onPick: (files: FileList) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) { onPick(e.target.files); e.target.value = ""; } }} />
      <button className="icon-btn" title="Attach files" onClick={() => ref.current?.click()}><IconClip /></button>
    </>
  );
}
