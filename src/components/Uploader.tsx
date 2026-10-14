"use client";
import { useRef, useState } from "react";
import { IconClip } from "@/components/icons";

export default function AttachButton({ onDone }: { onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  async function upload(e: any) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetch("/api/docs/upload", { method: "POST", body: fd });
    const j = await r.json();
    setBusy(false);
    onDone(j.error ? `Upload failed: ${j.error}` : `${j.filename} uploaded and summarized.`);
    if (ref.current) ref.current.value = "";
  }
  return (
    <>
      <input ref={ref} type="file" className="hidden" onChange={upload} accept=".pdf,.docx,.txt,.md,.csv" />
      <button className="icon-btn" title="Attach document" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <span className="text-xs">…</span> : <IconClip />}
      </button>
    </>
  );
}
