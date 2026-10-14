"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Shared sliding right-hand panel (the look/motion of the Events calendar
 * details drawer). Mounts with a slide-in, and requests close through
 * `onClose` only after the slide-out transition has finished so callers
 * can unmount us cleanly.
 */
export default function SlideOver({
  onClose,
  width = "max-w-md",
  label,
  title,
  actions,
  subheader,
  footer,
  bodyClass = "px-5 py-4",
  children
}: {
  onClose: () => void;
  width?: string;
  label?: string;
  title?: ReactNode;
  actions?: ReactNode;
  subheader?: ReactNode;
  footer?: ReactNode;
  bodyClass?: string;
  children: ReactNode;
}) {
  // keep it mounted during the slide-out transition
  const [open, setOpen] = useState(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function requestClose() {
    if (closingRef.current) return;
    closingRef.current = true;
    setOpen(false);
    setTimeout(() => onCloseRef.current(), 220); // let the slide-out finish before unmounting
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        onClick={requestClose}
        aria-hidden
        className={`fixed inset-0 z-40 bg-slate-900/30 dark:bg-black/50 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />
      <aside
        data-file-viewer
        aria-hidden={!open}
        className={`fixed top-0 right-0 z-50 h-full w-full ${width} bg-white dark:bg-zinc-950 border-l border-slate-200 dark:border-zinc-800 shadow-2xl transition-transform duration-200 flex flex-col ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {(label || title || actions) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-slate-100 dark:border-zinc-800">
            <div className="min-w-0">
              {label && <div className="text-[11px] uppercase tracking-wide text-brand-500 dark:text-brand-400 font-semibold mb-1">{label}</div>}
              {title && <h2 className="text-lg font-semibold leading-snug break-words">{title}</h2>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {actions}
              <button className="icon-btn shrink-0" onClick={requestClose} title="Close">✕</button>
            </div>
          </div>
        )}
        {subheader}
        <div className={`flex-1 overflow-y-auto ${bodyClass}`}>{children}</div>
        {footer}
      </aside>
    </>
  );
}