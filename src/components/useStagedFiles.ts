"use client";
import { useEffect, useState } from "react";

export type StagedFile = { file: File; id: string };

export default function useStagedFiles() {
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  function add(files: FileList | File[]) {
    const arr = Array.from(files);
    if (!arr.length) return;
    setStaged((s) => [...s, ...arr.map((file) => ({ file, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` }))]);
  }
  function remove(id: string) {
    setStaged((s) => s.filter((f) => f.id !== id));
  }
  function clear() {
    setStaged([]);
  }

  // upload all staged files, returns [{id, filename}] for linking
  async function uploadAll(): Promise<{ id: string; filename: string }[]> {
    if (!staged.length) return [];
    setUploading(true);
    const out: { id: string; filename: string }[] = [];
    try {
      for (const s of staged) {
        const fd = new FormData();
        fd.append("file", s.file);
        const r = await fetch("/api/docs/upload", { method: "POST", body: fd });
        const j = await r.json();
        if (!j.error && j.id) out.push({ id: j.id, filename: j.filename });
      }
    } finally {
      setUploading(false);
    }
    return out;
  }

  useEffect(() => {
    if (!staged.length) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [staged.length]);

  return { staged, add, remove, clear, uploadAll, uploading, dragOver, setDragOver };
}
