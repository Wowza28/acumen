"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Dropdown whose options render as the exact colored pills used in the UI.
 * Native <select> cannot style its <option> elements (they inherit the OS
 * widget look — white popup, plain words), so this renders an .input-styled
 * trigger plus a fixed-position popup measured from the trigger, so it is
 * never clipped by scrollable panels (drawers). Closes on outside click,
 * Escape, scroll, or resize.
 */
export default function TagDropdown({
  options,
  onSelect,
  placeholder,
  pillClass,
  value,
  clearLabel,
  triggerClass = "",
  className = "",
  disabled,
  title,
}: {
  options: readonly string[];
  onSelect: (value: string) => void;
  placeholder: string;
  pillClass: (tag: string) => string;
  /** When set, the trigger shows this tag as a colored pill instead of the placeholder. */
  value?: string | null;
  /** Optional plain "clear" item (e.g. "No tag") that selects "". */
  clearLabel?: string;
  /** Button sizing, e.g. "!h-7 !py-0 text-xs". */
  triggerClass?: string;
  /** Root layout, e.g. "flex-1". */
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; minWidth: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  function toggleOpen() {
    if (disabled) return;
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      // Estimate popup height so it flips above the trigger near the viewport bottom.
      const rows = Math.ceil((options.length + (clearLabel ? 1 : 0)) / 2);
      const est = rows * 30 + 20;
      const flip = r.bottom + est > window.innerHeight && r.top > est;
      setPos({
        left: Math.max(8, Math.min(r.left, window.innerWidth - 170)),
        top: flip ? undefined : r.bottom + 4,
        bottom: flip ? window.innerHeight - r.top + 4 : undefined,
        minWidth: Math.max(r.width, 160),
      });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      // The popup is portaled to document.body, so it lives OUTSIDE rootRef —
      // treat clicks landing in either the root or the popup as "inside".
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || popupRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true); // any scroll (page or drawer) closes it
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggleOpen}
        className={`input inline-flex items-center justify-between gap-2 text-left ${triggerClass}`}
      >
        <span className="inline-flex items-center min-w-0">
          {value ? (
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${pillClass(value)}`}>{value}</span>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
        </span>
        <span aria-hidden className="text-[9px] leading-none opacity-50">▾</span>
      </button>
      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popupRef}
              style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.minWidth }}
              className="fixed z-[70] rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl shadow-black/10 p-2 flex flex-wrap gap-1.5 max-w-[280px]"
            >
          {clearLabel && (
            <button
              type="button"
              onClick={() => { setOpen(false); onSelect(""); }}
              className="rounded-full border border-slate-200 dark:border-zinc-700 px-2.5 py-1 text-xs text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
            >
              {clearLabel}
            </button>
          )}
          {options.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setOpen(false); onSelect(t); }}
              className={`rounded-full border px-2 py-0.5 text-xs font-semibold hover:opacity-75 ${pillClass(t)}`}
            >
              {t}
            </button>
          ))}
          {!options.length && !clearLabel && (
            <span className="text-xs text-slate-400 dark:text-zinc-500 px-1 py-0.5">No tags left to add</span>
          )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
