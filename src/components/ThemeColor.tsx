"use client";
import { useEffect, useState } from "react";

/**
 * Standalone highlight-color picker (used inside the Settings window).
 * The `brand-*` Tailwind scale is defined as
 * rgb(var(--brand-NN) / <alpha>), so picking a color regenerates the full
 * 11-stop scale as CSS variables on :root — instantly recoloring every accent
 * in the app — and persists it to localStorage (re-applied in layout.tsx
 * before first paint).
 */

const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const DEFAULT = "#f97316"; // Tailwind orange-500

// Lighter stops are mixed toward white, darker stops toward black, so the
// generated scale is always monotonic regardless of the chosen hue.
const LIGHT_T: Record<number, number> = { 50: 0.96, 100: 0.9, 200: 0.78, 300: 0.6, 400: 0.35 };
const DARK_T: Record<number, number> = { 600: 0.16, 700: 0.32, 800: 0.47, 900: 0.6, 950: 0.74 };

const PRESETS = [
  "#f97316", "#ef4444", "#f59e0b", "#22c55e", "#10b981", "#14b8a6",
  "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#64748b",
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(f || "ff0000", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function scaleFromHex(hex: string): string[] {
  const [r, g, b] = hexToRgb(hex);
  const mix = (ch: number, target: number, t: number) => Math.round(ch + (target - ch) * t);
  return STOPS.map((s) => {
    if (s === 500) return `${r} ${g} ${b}`;
    if (s in LIGHT_T) {
      const t = LIGHT_T[s];
      return `${mix(r, 255, t)} ${mix(g, 255, t)} ${mix(b, 255, t)}`;
    }
    const t = DARK_T[s];
    return `${mix(r, 0, t)} ${mix(g, 0, t)} ${mix(b, 0, t)}`;
  });
}

function applyBrand(hex: string) {
  const scale = scaleFromHex(hex);
  const root = document.documentElement.style;
  STOPS.forEach((s, i) => root.setProperty(`--brand-${s}`, scale[i]));
  try {
    localStorage.setItem("brand-hex", hex);
    localStorage.setItem("brand-scale", JSON.stringify(scale));
  } catch {}
}

export default function ThemeColor() {
  const [hex, setHex] = useState(DEFAULT);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("brand-hex");
      if (saved) setHex(saved.toLowerCase());
    } catch {}
  }, []);

  function choose(next: string) {
    setHex(next.toLowerCase());
    applyBrand(next);
  }

  return (
    <div className="card !p-3 max-w-md">
      <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-zinc-500 mb-2">
        Highlight color
      </div>
      <div className="grid grid-cols-6 gap-1.5 mb-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            title={p}
            onClick={() => choose(p)}
            className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
              hex.toLowerCase() === p
                ? "ring-2 ring-slate-400 dark:ring-zinc-500 ring-offset-1 ring-offset-white dark:ring-offset-zinc-900"
                : "ring-1 ring-black/10"
            }`}
            style={{ background: p }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-zinc-800">
        <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 cursor-pointer">
          Custom
          <input
            type="color"
            value={hex}
            onChange={(e) => choose(e.target.value)}
            className="w-8 h-6 p-0 border-0 bg-transparent cursor-pointer"
            aria-label="Custom highlight color"
          />
        </label>
        <button
          type="button"
          className="btn-ghost !px-2 !py-1 text-xs ml-auto"
          onClick={() => choose(DEFAULT)}
        >
          Reset
        </button>
      </div>
    </div>
  );
}