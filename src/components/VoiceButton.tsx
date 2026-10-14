"use client";
import { useRef, useState } from "react";
import { IconMic, IconStop } from "@/components/icons";

export default function VoiceButton({ onTranscript }: { onTranscript: (t: string) => void }) {
  const [rec, setRec] = useState(false);
  const [busy, setBusy] = useState(false);
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function toggle() {
    if (rec) { mr.current?.stop(); setRec(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(stream);
      mr.current = m; chunks.current = [];
      m.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      m.onstop = async () => {
        setBusy(true);
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "voice.webm");
        const r = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
        const j = await r.json();
        setBusy(false);
        if (j.text) onTranscript(j.text);
        stream.getTracks().forEach((t) => t.stop());
      };
      m.start(); setRec(true);
    } catch (e) { alert("Mic blocked. Allow microphone + use Chrome/HTTPS."); }
  }

  return (
    <button onClick={toggle} className="icon-btn" title={rec ? "Stop recording" : "Voice input"} disabled={busy}>
      {busy ? <span className="text-xs">…</span> : rec ? <IconStop /> : <IconMic />}
    </button>
  );
}
