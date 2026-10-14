"use client";
import { useEffect, useState } from "react";
import { IconDownload, IconTrash } from "@/components/icons";
import { ViewerBody } from "@/components/ViewerBody";
import SlideOver from "@/components/SlideOver";
import { FILE_TAGS, tagClasses } from "@/components/FileBits";

export function useFileMeta(id: string | null) {
  const [data, setData] = useState<any>(null);
  const [people, setPeople] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  useEffect(() => {
    if (!id) { setData(null); return; }
    fetch(`/api/files/preview?id=${id}`).then((r) => r.json()).then(setData).catch(() => {});
    fetch("/api/contacts").then((r) => r.json()).then((j) => Array.isArray(j) && setPeople(j)).catch(() => {});
    fetch("/api/projects").then((r) => r.json()).then((j) => Array.isArray(j) && setProjects(j)).catch(() => {});
  }, [id]);
  return { data, setData, people, projects };
}

export default function FileViewer({ id, onClose, onDeleted, onRelinked }: {
  id: string | null; onClose: () => void; onDeleted: () => void; onRelinked: () => void;
}) {
  const { data, setData, people, projects } = useFileMeta(id);
  if (!id) return null;

  async function relink(field: string, value: string | null) {
    await fetch("/api/files", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [field]: value })
    });
    const j = await fetch(`/api/files/preview?id=${id}`).then((r) => r.json());
    setData(j); onRelinked();
  }

  async function del() {
    if (!confirm(`Delete ${data?.filename}?`)) return;
    await fetch(`/api/files?id=${id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    <SlideOver
      onClose={onClose}
      width="max-w-2xl"
      label="File"
      title={data?.filename || "Loading…"}
      actions={(
        <>
          <button className="icon-btn !text-red-500" title="Delete" onClick={del}><IconTrash /></button>
          <a className="icon-btn" title="Download" href={`/api/files/download?id=${id}`}><IconDownload /></a>
        </>
      )}
      subheader={(
        <div className="px-5 py-2 border-b border-slate-100 dark:border-zinc-800 flex gap-2 text-xs flex-wrap items-center">
          <select className="input !w-auto !py-1 text-xs" value={data?.contact?.id || ""} onChange={(e) => relink("contactId", e.target.value || null)}>
            <option value="">No person</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input !w-auto !py-1 text-xs" value={data?.project?.id || ""} onChange={(e) => relink("projectId", e.target.value || null)}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <select
            className={`input !w-auto !py-1 text-xs font-medium ${data?.tag ? tagClasses(data.tag) + " border" : ""}`}
            value={data?.tag || ""}
            onChange={(e) => relink("tag", e.target.value || null)}
            title="File tag"
          >
            <option value="">No tag</option>
            {FILE_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}
      bodyClass="p-4 bg-slate-100 dark:bg-zinc-950"
    >
      <ViewerBody id={id} data={data} />
      {data?.previewError && <div className="text-xs text-red-500 mt-2">Preview issue: {data.previewError}</div>}
    </SlideOver>
  );
}
