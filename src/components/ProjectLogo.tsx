"use client";
import { useRef, useState } from "react";
import { IconUpload } from "@/components/icons";

/**
 * Project logo display + uploader.
 * - With logo: shows the image (click to replace).
 * - Without logo: shows a "Click to upload logo" box.
 * `compact` variant is the small one used inside table rows.
 */
export default function ProjectLogo({ projectId, logoUrl, compact = false, onUploaded }: {
  projectId: string;
  logoUrl?: string | null;
  compact?: boolean;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function pick(file?: File) {
    if (!file) return;
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("id", projectId);
      fd.append("file", file);
      const r = await fetch("/api/projects/logo", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "upload failed");
      onUploaded();
    } catch (e: any) {
      setErr(String(e?.message || e).slice(0, 120));
    } finally {
      setBusy(false);
    }
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }}
    />
  );

  if (logoUrl) {
    return (
      <div
        className={`group relative rounded-lg overflow-hidden border border-slate-200 dark:border-zinc-700 bg-white cursor-pointer ${compact ? "w-10 h-10 shrink-0" : "w-40 h-40"}`}
        onClick={() => inputRef.current?.click()}
        title="Click to replace logo"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="Project logo" className="w-full h-full object-contain" />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] text-center px-1">
          {busy ? "Uploading…" : "Replace logo"}
        </div>
        {input}
        {err && <div className="absolute inset-x-0 bottom-0 bg-red-600 text-white text-[9px] px-1">{err}</div>}
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border-2 border-dashed border-slate-300 dark:border-zinc-600 text-slate-400 dark:text-zinc-500 flex items-center justify-center text-center cursor-pointer hover:border-slate-400 hover:text-slate-500 transition-colors ${compact ? "w-10 h-10 shrink-0 [&>svg]:w-4 [&>svg]:h-4" : "w-40 h-40 text-sm px-3"}`}
      onClick={() => inputRef.current?.click()}
      title="Click to upload logo"
    >
      {busy ? <span className="text-[9px]">Uploading…</span> : err ? <span className="text-[9px] leading-tight px-1">{err}</span> : compact ? <IconUpload /> : "Click to upload logo"}
      {input}
    </div>
  );
}
