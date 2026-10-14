"use client";
import { useEffect, useState } from "react";
import { IconFile } from "@/components/icons";
import PdfCanvas from "@/components/PdfCanvas";
import DocxView from "@/components/DocxView";

export function ViewerBody({ id, data }: { id: string; data: any }) {
  const [page, setPage] = useState(0);
  const [sheet, setSheet] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [renderErr, setRenderErr] = useState("");
  useEffect(() => { setPage(0); setSheet(0); setNumPages(0); setRenderErr(""); }, [id]);
  if (!data) return <div className="text-sm text-slate-400 animate-pulse">Loading preview…</div>;
  const src = `/api/files/download?id=${id}`;

  if (data.kind === "image") {
    return <img src={src} alt={data.filename} className="max-w-full mx-auto rounded shadow" />;
  }

  if (data.kind === "pdf") {
    return (
      <div className="flex flex-col items-center gap-3">
        {numPages > 1 && (
          <div className="flex items-center gap-2 text-sm sticky top-0 z-10 bg-transparent">
            <button className="btn-ghost" disabled={page <= 0} onClick={() => setPage(page - 1)}>← Prev</button>
            <span className="text-slate-400">Page {page + 1} / {numPages}</span>
            <button className="btn-ghost" disabled={page >= numPages - 1} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        )}
        {renderErr && <div className="card text-sm text-red-500">Render issue: {renderErr}</div>}
        <div className="w-full max-w-[680px] shadow rounded-sm overflow-hidden border border-slate-200 dark:border-zinc-700">
          <PdfCanvas
            src={src}
            page={page + 1}
            mode="viewer"
            textLayer
            onNumPages={setNumPages}
            onError={setRenderErr}
          />
        </div>
        <div className="text-[11px] text-slate-400">Text is selectable — drag to copy.</div>
      </div>
    );
  }

  if (data.kind === "docx") {
    return (
      <div className="flex flex-col items-center gap-2 w-full">
        {renderErr && <div className="card text-sm text-red-500">Render issue: {renderErr}</div>}
        <div className="w-full">
          <DocxView src={src} mode="viewer" onNumPages={setNumPages} onError={setRenderErr} />
        </div>
        <div className="text-[11px] text-slate-400">Text is selectable — drag to copy.</div>
      </div>
    );
  }

  if (data.kind === "sheet") {
    return (
      <div className="bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 shadow rounded-sm p-2 w-full">
        <div className="flex gap-1 mb-2 flex-wrap px-2 pt-1">
          {(data.sheets || []).map((s: any, i: number) => (
            <button key={i} onClick={() => setSheet(i)} className={`tab-btn ${sheet === i ? "tab-btn-active" : ""}`}>{s.name}</button>
          ))}
        </div>
        {/* fits the viewer width like PDFs; the outer pane scrolls vertically */}
        <table className="text-xs w-full table-auto border-collapse">
          <tbody>
            {(data.sheets?.[sheet]?.rows || []).map((row: any[], ri: number) => (
              <tr key={ri} className="border-b border-slate-100 dark:border-zinc-800">
                {row.map((cell: any, ci: number) => (
                  <td key={ci} className="px-2 py-1 border-r border-slate-100 dark:border-zinc-800 whitespace-nowrap">{String(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.kind === "text") {
    if (typeof data.text !== "string") {
      return (
        <div className="card text-sm text-slate-500">
          Preview unavailable — <a className="underline" href={src}>download to view</a>
        </div>
      );
    }
    return (
      <div className="bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 shadow rounded-sm p-4 w-full">
        <pre className="whitespace-pre-wrap break-words text-xs font-mono leading-relaxed max-h-[70vh] overflow-y-auto">{data.text}</pre>
        {data.textTruncated && (
          <div className="text-[11px] text-slate-400 mt-2">Preview truncated — download the file for the full content.</div>
        )}
      </div>
    );
  }

  if (data.kind === "audio") return <audio controls className="w-full" src={src} />;
  if (data.kind === "video") return <video controls className="w-full rounded-xl" src={src} />;

  return (
    <div className="card text-sm text-slate-500">
      <div className="flex items-center gap-2 mb-2"><IconFile /> No inline preview for this type.</div>
      <a className="underline" href={src}>Download to view</a>
    </div>
  );
}
