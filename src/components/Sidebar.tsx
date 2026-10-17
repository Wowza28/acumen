"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconPeople, IconProject, IconMeeting, IconTask, IconNote, IconFile, IconAccounts, IconChat, IconSun, IconMoon, IconDots, IconSettings } from "@/components/icons";
import Settings from "@/components/Settings";

const NAV = [
  { href: "/", label: "Home", Icon: IconHome },
  { href: "/people", label: "People", Icon: IconPeople },
  { href: "/projects", label: "Projects", Icon: IconProject },
  { href: "/events", label: "Events", Icon: IconMeeting },
  { href: "/tasks", label: "Tasks", Icon: IconTask },
  { href: "/notes", label: "Notes", Icon: IconNote },
  { href: "/files", label: "Files", Icon: IconFile },
  { href: "/accounts", label: "Accounts", Icon: IconAccounts },
];

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const pathname = usePathname();
  const [chats, setChats] = useState<any[] | null>(null);
  const [theme, setTheme] = useState("dark");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuUp, setMenuUp] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  function toggleMenu(id: string, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (openMenu === id) { setOpenMenu(null); return; }
    // If the button is near the bottom of the viewport, open the menu upward.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuUp(rect.bottom + 90 > window.innerHeight);
    setOpenMenu(id);
  }

  async function loadChats() {
    const j = await fetch("/api/chats").then((r) => r.json()).catch(() => []);
    if (Array.isArray(j)) {
      setChats(j);
      try { sessionStorage.setItem("chat-list", JSON.stringify(j)); } catch {}
    }
  }
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("chat-list");
      if (cached) setChats(JSON.parse(cached));
    } catch {}
    loadChats();
    try { setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light"); } catch {}
    const h = () => loadChats();
    window.addEventListener("chats-changed", h);
    return () => { window.removeEventListener("chats-changed", h); };
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem("theme", next); } catch {}
  }

  const aside = (
    <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col border-r border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900">
      <div className="p-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-0.5 text-2xl tracking-[0.15em] font-thin"><span className="text-brand-500 dark:text-brand-400 text-2xl">&#923;</span>CUMEN</Link>
        <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">{theme === "dark" ? <IconSun /> : <IconMoon />}</button>
      </div>
      <nav className="px-3 flex flex-col gap-1 shrink-0">
        {NAV.map(({ href, label, Icon }) => (
          <Link key={href} href={href} onClick={onNavigate}
            className={`navitem ${pathname === href ? "navitem-active" : ""}`}>
            <Icon /><span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="px-3 mt-4 flex items-center justify-between shrink-0">
        <span className="text-xs uppercase tracking-wide text-slate-400">Chat History</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 flex flex-col gap-1 mt-1">
        {(chats || []).map((c) => {
          const active = typeof window !== "undefined" && window.location.search.includes(`chat=${c.id}`);
          return (
            <div key={c.id} className={`navitem !gap-0 group relative !p-0 ${active ? "navitem-active" : ""}`}>
              <Link href={`/?chat=${c.id}`} onClick={onNavigate} className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2 rounded-lg">
                <span className="shrink-0 [&>svg]:w-[18px] [&>svg]:h-[18px]"><IconChat /></span>
                <span className="truncate font-normal">{c.title || "Untitled"}</span>
              </Link>
              <div className="relative shrink-0 pr-1">
                <button
                  className="icon-btn !p-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
                  title="Chat options"
                  onClick={(e) => toggleMenu(c.id, e)}
                  onBlur={() => setTimeout(() => setOpenMenu((m) => (m === c.id ? null : m)), 150)}
                ><IconDots /></button>
                {openMenu === c.id && (
                  <div className={`absolute right-0 z-20 card !p-1 min-w-[120px] ${menuUp ? "bottom-7" : "top-7"}`} onMouseDown={(e) => e.preventDefault()}>
                    <button
                      className="btn-ghost w-full text-left text-red-500 text-xs"
                      onClick={async (e) => {
                        e.preventDefault();
                        if (!confirm(`Delete "${c.title || "Untitled"}"?`)) return;
                        setOpenMenu(null);
                        await fetch(`/api/chats?id=${c.id}`, { method: "DELETE" });
                        window.dispatchEvent(new Event("chats-changed"));
                        if (active) window.location.href = "/";
                        else loadChats();
                      }}
                    >Delete chat</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {chats === null
          ? <span className="text-xs text-slate-400 px-3 animate-pulse">Loading chats…</span>
          : !chats.length && <span className="text-xs text-slate-400 px-3">No chats yet.</span>}
      </div>
      <div className="p-3 border-t border-slate-200 dark:border-zinc-800">
        <button className="navitem w-full" onClick={() => setSettingsOpen(true)} title="Settings">
          <IconSettings /><span>Settings</span>
        </button>
      </div>
    </aside>
  );
  return (
    <>
      {aside}
    {settingsOpen && mounted && createPortal(<Settings onClose={() => setSettingsOpen(false)} />, document.body)}
  </>);
}