"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// docx-preview is loaded dynamically inside the effect (browser-only) to
// avoid SSR module-interop issues. It's a pure-npm dependency — nothing
// outside the project folder is required.
let docxPromise: Promise<any> | null = null;
function getDocxPreview() {
  if (!docxPromise) docxPromise = import("docx-preview").then((m: any) => m.default ?? m);
  return docxPromise;
}

/**
 * Renders a .docx with docx-preview (npm, in-project): real pagination,
 * selectable/copyable text, images and tables.
 * - mode="viewer": pages scaled to the sidebar width (like PDFs do), the
 *   outer viewer pane scrolls — no inner zoomed scrollbars.
 * - mode="fit": first page scaled down and centered in the fixed card box.
 */
export default function DocxView({ src, mode = "viewer", onNumPages, onError }: {
  src: string;
  mode?: "viewer" | "fit";
  onNumPages?: (n: number) => void;
  onError?: (msg: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [numPages, setNumPages] = useState(0);

  const computeLayout = useCallback(() => {
    const wrap = wrapRef.current;
    const host = hostRef.current;
    if (!wrap || !host) return;
    const sections = Array.from(host.children) as HTMLElement[];
    if (!sections.length) return;

    if (mode === "fit") {
      // first page only, letterboxed center in the card box
      sections.forEach((s, i) => (s.style.display = i === 0 ? "" : "none"));
      const pw = sections[0].offsetWidth || 794;
      const ph = sections[0].offsetHeight || 1123;
      const bw = wrap.clientWidth;
      const bh = wrap.clientHeight;
      if (bw < 10 || bh < 10) return;
      const k = Math.min(bw / pw, bh / ph);
      host.style.position = "absolute";
      host.style.left = `${(bw - pw * k) / 2}px`;
      host.style.top = `${(bh - ph * k) / 2}px`;
      host.style.transform = `scale(${k})`;
      host.style.transformOrigin = "top left";
      host.style.margin = "0";
    } else {
      // viewer: scale pages to the container width, outer pane scrolls
      sections.forEach((s) => (s.style.display = ""));
      const pw = Math.max(...sections.map((s) => s.offsetWidth), 0) || 794;
      const naturalH = host.scrollHeight;
      const bw = wrap.clientWidth;
      if (bw < 10) return;
      const k = bw / pw;
      wrap.style.height = `${naturalH * k}px`;
      host.style.position = "absolute";
      host.style.left = "0";
      host.style.top = "0";
      host.style.transform = `scale(${k})`;
      host.style.transformOrigin = "top left";
      host.style.margin = "0";
    }
  }, [mode]);

  useEffect(() => {
    let alive = true;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`download failed (${res.status})`);
        const buf = await res.arrayBuffer();
        const host = hostRef.current;
        if (!alive || !host || !styleRef.current) return;
        // styleContainer must be a persistent sibling: renderAsync() clears
        // both containers' innerHTML before rendering.
        const { renderAsync } = await getDocxPreview();
        await renderAsync(buf, host, styleRef.current, {
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          inWrapper: false
        });
        if (!alive) return;
        const sections = host.querySelectorAll("section, .docx-wrapper > div");
        const n = Math.max(sections.length, 1);
        setNumPages(n);
        onNumPages?.(n);
        computeLayout();
        // late-loading images/fonts change page sizes — recompute
        const remeasure = () => computeLayout();
        host.addEventListener("load", remeasure, true);
        (document as any).fonts?.ready?.then(remeasure)?.catch?.(() => {});
        const t = setTimeout(remeasure, 300);
        cleanup = () => { clearTimeout(t); host.removeEventListener("load", remeasure, true); };
      } catch (e: any) {
        if (alive) onError?.(String(e?.message || e).slice(0, 200));
      }
    })();
    return () => { alive = false; cleanup?.(); };
  }, [src, mode]);

  // re-fit on container resize
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => computeLayout());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [computeLayout]);

  function goTo(n: number) {
    const host = hostRef.current;
    if (!host) return;
    const sections = Array.from(host.children) as HTMLElement[];
    const i = Math.max(0, Math.min(n, sections.length - 1));
    setPage(i);
    sections[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className={`flex flex-col items-center w-full ${mode === "viewer" ? "gap-3" : "h-full"}`}>
      <div ref={styleRef} style={{ display: "none" }} />
      {mode === "viewer" && numPages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <button className="btn-ghost" disabled={page <= 0} onClick={() => goTo(page - 1)}>← Prev</button>
          <span className="text-slate-400">Page {page + 1} / {numPages}</span>
          <button className="btn-ghost" disabled={page >= numPages - 1} onClick={() => goTo(page + 1)}>Next →</button>
        </div>
      )}
      <div
        ref={wrapRef}
        className={mode === "fit" ? "relative w-full h-full overflow-hidden" : "relative w-full overflow-hidden"}
      >
        <div ref={hostRef} className={mode === "viewer" ? "docx-host absolute top-0 left-0" : "docx-host"} />
      </div>
    </div>
  );
}
