"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

// pdf.js is loaded dynamically inside effects: its ESM build uses top-level
// await, which breaks SSR module interop if imported statically. All runtime
// assets (worker/fonts/cmaps) are shipped in-project under public/pdf/ by
// scripts/copy-pdf-worker.mjs — no system-level tools required.
let pdfjsPromise: Promise<any> | null = null;
function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      const pdfjs: any = (m as any).default ?? m;
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

const docCache = new Map<string, Promise<PDFDocumentProxy>>();
function loadDoc(src: string) {
  if (!docCache.has(src)) {
    docCache.set(
      src,
      getPdfjs().then((pdfjs) =>
        pdfjs.getDocument({
          url: src,
          standardFontDataUrl: "/pdf/standard_fonts/",
          cMapUrl: "/pdf/cmaps/",
          cMapPacked: true
        }).promise
      )
    );
  }
  return docCache.get(src)!;
}

/**
 * Renders one page of a PDF with an overlaid, selectable text layer.
 * mode="viewer": fills the container width (used in the slide-over).
 * mode="fit":    letterboxes the page centered inside the container box (cards).
 */
export default function PdfCanvas({ src, page = 1, mode = "viewer", textLayer = false, onNumPages, onError }: {
  src: string;
  page?: number;
  mode?: "viewer" | "fit";
  textLayer?: boolean;
  onNumPages?: (n: number) => void;
  onError?: (msg: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tlRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);
  const renderTaskRef = useRef<any>(null);
  const tlTaskRef = useRef<any>(null);

  // observe container box
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // load document
  useEffect(() => {
    let alive = true;
    setDoc(null);
    loadDoc(src)
      .then((d) => { if (alive) { setDoc(d); onNumPages?.(d.numPages); } })
      .catch((e) => onError?.(String(e?.message || e).slice(0, 200)));
    return () => { alive = false; };
  }, [src]);

  // render page + text layer
  useEffect(() => {
    if (!doc || !box || !canvasRef.current || box.w < 10) return;
    let alive = true;
    (async () => {
      try {
        const p = await doc.getPage(Math.min(page, doc.numPages));
        const base = p.getViewport({ scale: 1 });
        const s =
          mode === "fit"
            ? Math.max(0.05, Math.min(box.w / base.width, (box.h || 400) / base.height))
            : box.w / base.width;
        const viewport = p.getViewport({ scale: s });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current!;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        setPageSize({ w: Math.floor(viewport.width), h: Math.floor(viewport.height) });
        const ctx = canvas.getContext("2d")!;
        renderTaskRef.current?.cancel?.();
        const task = p.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
        });
        renderTaskRef.current = task;
        await task.promise;
        if (!alive) return;

        if (textLayer && tlRef.current) {
          const tl = tlRef.current;
          tl.innerHTML = "";
          tl.style.setProperty("--scale-factor", String(viewport.scale));
          tlTaskRef.current?.cancel?.();
          const pdfjs = await getPdfjs();
          const t = pdfjs.renderTextLayer({
            textContentSource: p.streamTextContent(),
            container: tl,
            viewport,
            textDivs: []
          });
          tlTaskRef.current = t;
          await t.promise;
        }
      } catch (e: any) {
        if (e?.name !== "RenderingCancelledException" && alive) {
          onError?.(String(e?.message || e).slice(0, 200));
        }
      }
    })();
    return () => { alive = false; renderTaskRef.current?.cancel?.(); tlTaskRef.current?.cancel?.(); };
  }, [doc, page, box?.w, box?.h, mode, textLayer]);

  return (
    <div ref={wrapRef} className={`w-full ${mode === "fit" ? "h-full" : ""} flex items-center justify-center overflow-hidden`}>
      <div className="relative" style={pageSize ? { width: pageSize.w, height: pageSize.h } : undefined}>
        <canvas ref={canvasRef} className="block" />
        {textLayer && <div ref={tlRef} className="textLayer absolute inset-0" />}
      </div>
    </div>
  );
}
