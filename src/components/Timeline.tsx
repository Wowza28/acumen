"use client";
import { useEffect, useState } from "react";

export default function Timeline({ sel }: { sel: { kind: string; id: string; name: string } | null }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    if (!sel) { setData(null); return; }
    const q = sel.kind === "contact" ? `contactId=${sel.id}` : `projectId=${sel.id}`;
    fetch(`/api/timeline?${q}`).then((r) => r.json()).then(setData);
  }, [sel]);
  if (!sel) return <div className="card text-sm text-slate-500">Select a contact/project to see timeline.</div>;
  if (!data) return <div className="card text-sm">Loading {sel.name}…</div>;
  return (
    <div className="card">
      <b>Timeline: {sel.name}</b>
      <div className="mt-2 flex flex-col gap-2 text-sm">
        {(data.notes || []).map((n: any) => (
          <div key={n.id} className="border-l-2 border-blue-500 pl-2">📝 {n.body.slice(0, 300)} <span className="text-xs text-slate-400">[{n.via}]</span></div>
        ))}
        {(data.meetings || []).map((m: any) => (
          <div key={m.id} className="border-l-2 border-green-500 pl-2">📅 {m.title} — {new Date(m.startsAt).toLocaleString()}</div>
        ))}
        {(data.docs || []).map((d: any) => (
          <div key={d.id} className="border-l-2 border-purple-500 pl-2">📎 {d.filename} — {d.summary?.slice(0, 200) || "no summary"}</div>
        ))}
        {(data.emails || []).map((e: any) => (
          <div key={e.id} className="border-l-2 border-amber-500 pl-2">✉️ {e.subject} <span className="text-slate-500">{e.snippet?.slice(0, 150)}</span></div>
        ))}
        {!data.notes?.length && !data.meetings?.length && !data.docs?.length && <span className="text-slate-500">Empty — talk to the chat.</span>}
      </div>
    </div>
  );
}
