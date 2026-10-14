"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Shell from "@/components/Shell";
import PageHeader from "@/components/PageHeader";
import FileViewer from "@/components/FileViewer";
import { IconPeople, IconProject, IconFile, IconDownload, IconTrash, IconUpload } from "@/components/icons";
import { kindOf, fmtSize, FILE_TAGS, tagClasses } from "@/components/FileBits";
import PdfCanvas from "@/components/PdfCanvas";
import DocxView from "@/components/DocxView";

const TYPE_FILTERS = ["all", "pdf", "doc", "sheet", "image", "text", "audio", "video", "file"] as const;

// Mini spreadsheet preview for the card box: first rows of the first sheet,
// letterboxed center like the other card previews.
function SheetThumb({ id }: { id: string }) {
  const [rows, setRows] = useState<any[][] | null>(null);
  useEffect(() => {
    fetch(`/api/files/preview?id=${id}`)
      .then((r) => r.json())
      .then((j) => setRows(Array.isArray(j?.sheets?.[0]?.rows) ? j.sheets[0].rows.slice(0, 40) : []))
      .catch(() => setRows([]));
  }, [id]);

  if (rows === null) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400">
        <IconFile />
        <span className="text-[11px] font-mono">sheet</span>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden p-1.5">
      <div className="bg-white border border-slate-200 dark:border-zinc-700 rounded shadow-sm overflow-hidden max-w-full max-h-full">
        <table className="text-[8px] leading-tight border-collapse">
          <tbody>
            {rows.slice(0, 12).map((row, ri) => (
              <tr key={ri}>
                {row.slice(0, 8).map((cell, ci) => (
                  <td key={ci} className="px-1 py-[1px] border border-slate-100 dark:border-zinc-800 whitespace-nowrap max-w-[64px] overflow-hidden text-ellipsis text-slate-600 dark:text-zinc-300">
                    {String(cell ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Fixed-size preview box: every card is identical height and the first page
// is letterboxed CENTER inside it regardless of page size/orientation.
function Thumb({ d }: { d: any }) {
  const kind = kindOf(d.mime, d.filename);
  const [imgFail, setImgFail] = useState(false);

  return (
    <div className="w-full h-36 rounded-lg overflow-hidden border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/40 flex items-center justify-center mb-2 relative">
      {kind === "image" && !imgFail && (
        <img
          src={`/api/files/download?id=${d.id}`}
          alt=""
          onError={() => setImgFail(true)}
          className="max-w-full max-h-full object-contain"
          loading="lazy"
        />
      )}
      {kind === "pdf" && (
        <div className="absolute inset-1">
          <PdfCanvas src={`/api/files/download?id=${d.id}`} page={1} mode="fit" />
        </div>
      )}
      {kind === "doc" && (
        <div className="absolute inset-1">
          <DocxView src={`/api/files/download?id=${d.id}`} mode="fit" />
        </div>
      )}
      {kind === "sheet" && <SheetThumb id={d.id} />}
      {(kind === "audio" || kind === "video" || kind === "text" || kind === "file" || (kind === "image" && imgFail)) && (
        <div className="flex flex-col items-center gap-1 text-slate-400">
          <IconFile />
          <span className="text-[11px] font-mono">{kind}</span>
        </div>
      )}
    </div>
  );
}


export default function FilesPage() {
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState<string>("all");
  const [personF, setPersonF] = useState("");
  const [projectF, setProjectF] = useState("");
  const [tagF, setTagF] = useState<string>("all");
  const [sel, setSel] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: FileList | File[] | null | undefined) {
    const arr = files ? Array.from(files) : [];
    if (!arr.length) return;
    setUploading(true);
    setUploadErrors([]);
    const errs: string[] = [];
    try {
      for (const f of arr) {
        try {
          const fd = new FormData();
          fd.append("file", f);
          const r = await fetch("/api/docs/upload", { method: "POST", body: fd });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || j.error) errs.push(`${f.name}: ${j.error || "Upload failed."}`);
        } catch (e: any) {
          errs.push(`${f.name}: ${e?.message || "Upload failed."}`);
        }
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      load();
    }
    setUploadErrors(errs);
  }

  async function upload(e: any) {
    await uploadFiles(e.target.files);
  }

  async function load() {
    const j = await fetch("/api/files").then((r) => r.json()).catch(() => []);
    setList(Array.isArray(j) ? j : []);
  }
  useEffect(() => { load(); }, []);

  // Page-wide drag & drop: window listeners so the drop target is the whole
  // content area (including empty space around/below the grid), not just the
  // cards. Guarded to Files drags only; the slide-over viewer is excluded so
  // dropping a file onto an open viewer doesn't trigger an upload.
  const uploadFilesRef = useRef(uploadFiles);
  uploadFilesRef.current = uploadFiles;
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes("Files");
    const inViewer = (e: Event) => (e.target as HTMLElement | null)?.closest?.("[data-file-viewer]") != null;
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e) || inViewer(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragOver(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e) || inViewer(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragOver(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e) || inViewer(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragOver(false);
      if (e.dataTransfer?.files?.length) uploadFilesRef.current(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const people = useMemo(() => {
    const m = new Map<string, string>();
    list.forEach((d) => { if (d.contact) m.set(d.contact.id, d.contact.name); });
    return Array.from(m.entries());
  }, [list]);
  const projects = useMemo(() => {
    const m = new Map<string, string>();
    list.forEach((d) => { if (d.project) m.set(d.project.id, d.project.title); });
    return Array.from(m.entries());
  }, [list]);

  const filtered = list.filter((d) => {
    if (typeF !== "all" && kindOf(d.mime, d.filename) !== typeF) return false;
    if (tagF !== "all" && (d.tag || "") !== tagF) return false;
    if (personF && d.contactId !== personF) return false;
    if (projectF && d.projectId !== projectF) return false;
    if (q) {
      const s = q.toLowerCase();
      if (!(d.filename.toLowerCase().includes(s) || (d.summary || "").toLowerCase().includes(s))) return false;
    }
    return true;
  });

  async function del(id: string, name: string) {
    if (!confirm(`Delete ${name}? Removes the file and its search index.`)) return;
    await fetch(`/api/files?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <Shell wide>
      {dragOver && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 pointer-events-none">
          <div className="card text-sm font-medium">Drop files to upload</div>
        </div>
      )}
      <PageHeader icon="files" title="Files" count={filtered.length} right={
        <div className="flex items-center gap-2">
          <input className="input !w-56" placeholder="Search filename…" value={q} onChange={(e) => setQ(e.target.value)} />
          <input ref={fileRef} type="file" className="hidden" multiple onChange={upload} />
          <button className="btn !py-1.5 flex items-center gap-1.5" disabled={uploading} onClick={() => fileRef.current?.click()} title="Upload a file">
            <IconUpload /> {uploading ? "Uploading…" : "Upload File"}
          </button>
        </div>
      } />
      <div className="flex flex-wrap gap-1.5 mb-3">
        <select className="input !w-auto text-xs" value={typeF} onChange={(e) => setTypeF(e.target.value)}>
          <option value="all">All types</option>
          {TYPE_FILTERS.filter((t) => t !== "all").map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input !w-auto text-xs" value={tagF} onChange={(e) => setTagF(e.target.value)}>
          <option value="all">All tags</option>
          <option value="">Untagged</option>
          {FILE_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input !w-auto text-xs" value={personF} onChange={(e) => setPersonF(e.target.value)}>
          <option value="">All people</option>
          {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select className="input !w-auto text-xs" value={projectF} onChange={(e) => setProjectF(e.target.value)}>
          <option value="">All projects</option>
          {projects.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
        </select>
      </div>
      {/* paperless-ngx style grid: up to 6 per row so detail lines fit fully */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {filtered.map((d) => (
          <div key={d.id} className="card !rounded-xl !p-2.5 cursor-pointer hover:shadow-md hover:border-brand-500/50 dark:hover:border-brand-400/50 transition-all flex flex-col" onClick={() => setSel(d.id)}>
            <Thumb d={d} />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-xs truncate" title={d.filename}>{d.filename}</div>
              <div className="text-[10px] text-slate-400 whitespace-nowrap flex items-center gap-1.5">
                <span className="truncate">{kindOf(d.mime, d.filename)} · {fmtSize(d.size)} · {new Date(d.createdAt).toLocaleDateString()}</span>
                {d.tag && (
                  <span className={`shrink-0 inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-semibold leading-tight ${tagClasses(d.tag)}`}>{d.tag}</span>
                )}
              </div>
              {(d.contact || d.project) && (
                <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5 min-w-0">
                  {d.contact && <span className="flex items-center gap-1 truncate"><IconPeople className="shrink-0" />{d.contact.name}</span>}
                  {d.project && <span className="flex items-center gap-1 truncate"><IconProject className="shrink-0" />{d.project.title}</span>}
                </div>
              )}
            </div>
            <div className="flex gap-0.5 mt-1.5 -mb-1" onClick={(e) => e.stopPropagation()}>
              <a className="icon-btn !p-1.5" title="Download" href={`/api/files/download?id=${d.id}`}><IconDownload /></a>
              <button className="icon-btn !p-1.5 text-red-500" title="Delete" onClick={() => del(d.id, d.filename)}><IconTrash /></button>
            </div>
          </div>
        ))}
      </div>
      {!filtered.length && <div className="card text-sm text-slate-500 mt-3">No files yet — upload one above or drag & drop files anywhere on this page.</div>}
      {!!uploadErrors.length && (
        <div className="card text-sm text-red-500 mt-3">
          {uploadErrors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
      <FileViewer id={sel} onClose={() => setSel(null)} onDeleted={() => { setSel(null); load(); }} onRelinked={load} />
    </Shell>
  );
}
