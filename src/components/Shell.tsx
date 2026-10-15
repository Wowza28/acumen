"use client";
import { useState } from "react";
import Sidebar from "@/components/Sidebar";

export default function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen flex">
      <div className="hidden md:block"><Sidebar /></div>
      {/* Mobile drawer: always mounted so the slide/fade transition runs on
          open AND close; pointer-events disabled while closed. The panel is
          solid (no alpha) so the dark overlay doesn't bleed through. */}
      <div className={`md:hidden fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        />
        <div className={`relative h-full w-64 bg-slate-50 dark:bg-zinc-900 shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}>
          <Sidebar onNavigate={() => setOpen(false)} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="md:hidden p-3 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-2">
          <button className="btn-ghost" onClick={() => setOpen(true)}>☰</button>
          <span className="flex items-center gap-0.5 text-xl tracking-[0.12em] font-thin"><span className="text-brand-500 dark:text-brand-400 text-xl">&#923;</span>CUMEN</span>
        </div>
        <div className={`p-4 md:p-6 mx-auto w-full ${wide ? "" : "max-w-6xl"}`}>{children}</div>
      </div>
    </div>
  );
}
