"use client";
import { useRef, useState } from "react";

/**
 * Contact profile picture display + uploader.
 * - With photo: shows the image (click to replace).
 * - Without photo: shows a "Click to upload photo" box.
 */
export default function ContactPhoto({ contactId, photoUrl, onUploaded, size = "w-24 h-24" }: {
  contactId: string;
  photoUrl?: string | null;
  onUploaded: () => void;
  size?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function pick(file?: File) {
    if (!file) return;
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("id", contactId);
      fd.append("file", file);
      const r = await fetch("/api/contacts/photo", { method: "POST", body: fd });
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

  if (photoUrl) {
    return (
      <div
        className={`group relative rounded-full overflow-hidden border border-slate-200 dark:border-zinc-700 bg-white cursor-pointer ${size} shrink-0`}
        onClick={() => inputRef.current?.click()}
        title="Click to replace photo"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="Profile" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] text-center px-1">
          {busy ? "Uploading…" : "Replace"}
        </div>
        {input}
        {err && <div className="absolute inset-x-0 bottom-0 bg-red-600 text-white text-[9px] px-1 truncate">{err}</div>}
      </div>
    );
  }

  return (
    <div
      className={`rounded-full border-2 border-dashed border-slate-300 dark:border-zinc-600 text-slate-400 dark:text-zinc-500 flex items-center justify-center text-center cursor-pointer hover:border-slate-400 hover:text-slate-500 transition-colors ${size} text-[10px] px-2 leading-tight`}
      onClick={() => inputRef.current?.click()}
      title="Click to upload photo"
    >
      {busy ? "Uploading…" : err || "Click to upload photo"}
      {input}
    </div>
  );
}
