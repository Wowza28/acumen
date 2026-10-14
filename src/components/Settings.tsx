"use client";
import { useEffect, useState } from "react";
import { IconX, IconCheck, IconPencil, IconTrash, IconPlus, IconMeeting } from "@/components/icons";
import ThemeColor from "@/components/ThemeColor";

type SettingsTab = "general" | "assistant" | "accounts";

/**
 * Floating Settings window (opens from the sidebar gear button). Left rail
 * switches between General, Assistant and Accounts panels. Escape or ✕ /
 * clicking the backdrop closes it.
 */
export default function Settings({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<SettingsTab>("general");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: "general", label: "General" },
    { id: "assistant", label: "Assistant" },
    { id: "accounts", label: "Accounts" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-[1000px] bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[754px] max-h-[90vh]" role="dialog" aria-label="Settings">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-800 shrink-0 bg-white dark:bg-zinc-900">
          <h2 className="text-base font-semibold">Settings</h2>
          <button className="icon-btn" onClick={onClose} title="Close"><IconX /></button>
        </div>
        <div className="flex flex-1 min-h-0">
          <nav className="w-48 shrink-0 border-r border-slate-100 dark:border-zinc-800 p-3 flex flex-col gap-1 bg-slate-50 dark:bg-zinc-950">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`text-left px-3 py-2 rounded-xl text-sm ${tab === t.id ? "navitem-active" : "navitem"}`}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="flex-1 min-w-0 p-6 text-sm overflow-y-auto bg-white dark:bg-zinc-900">
            {tab === "general" ? <GeneralTab /> : tab === "assistant" ? <AssistantTab /> : <AccountsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

function GeneralTab() {
  const [mail, setMail] = useState<{ busy: boolean; msg: string }>({ busy: false, msg: "" });
  const [cal, setCal] = useState<{ busy: boolean; msg: string }>({ busy: false, msg: "" });
  const [rate, setRate] = useState("3.67");
  const [rateBusy, setRateBusy] = useState(false);
  const [rateMsg, setRateMsg] = useState("");
  const [titanConfigured, setTitanConfigured] = useState<boolean | null>(null);

  function loadTitan() {
    fetch("/api/settings/titan").then((r) => r.json()).then((j) => {
      setTitanConfigured(!!j?.configured);
    }).catch(() => setTitanConfigured(false));
  }

  useEffect(() => {
    fetch("/api/settings/exchange-rate").then((r) => r.json()).then((j) => {
      if (Number.isFinite(Number(j?.rate))) setRate(String(j.rate));
    }).catch(() => {});
    loadTitan();
    const h = () => loadTitan();
    window.addEventListener("acumen:titan-changed", h);
    return () => window.removeEventListener("acumen:titan-changed", h);
  }, []);

  async function saveRate() {
    setRateBusy(true); setRateMsg("");
    try {
      const response = await fetch("/api/settings/exchange-rate", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save rate.");
      setRate(String(data.rate));
      setRateMsg("Saved.");
      window.dispatchEvent(new CustomEvent("acumen:exchange-rate", { detail: { rate: data.rate } }));
    } catch (error: any) {
      setRateMsg(error?.message || "Could not save rate.");
    } finally { setRateBusy(false); }
  }

  async function refreshMail() {
    setMail({ busy: true, msg: "" });
    try {
      const r = await fetch("/api/titan/mail/sync");
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) setMail({ busy: false, msg: j.error || "Mail sync failed." });
      else setMail({ busy: false, msg: `Done — ${j.synced ?? 0} new message(s) synced, ${j.autoLinked ?? 0} auto-linked to people.` });
    } catch {
      setMail({ busy: false, msg: "Mail sync failed — is Titan configured?" });
    }
  }

  async function refreshCalendar() {
    setCal({ busy: true, msg: "" });
    try {
      // Drop the stale-while-revalidate cache and notify the open Events page
      // (if any) to refetch live from Titan.
      try { sessionStorage.removeItem("events-cache-v1"); } catch {}
      window.dispatchEvent(new Event("acumen:refresh-calendar"));
      setCal({ busy: false, msg: "Done — calendar refreshed from Titan." });
    } catch {
      setCal({ busy: false, msg: "Calendar refresh failed — is Titan configured?" });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="flex items-center justify-between gap-3 mb-1">
          <b className={titanConfigured === false ? "text-slate-400 dark:text-zinc-500" : ""}>Refresh mail</b>
          <button className="btn !py-1 !px-3 text-xs" onClick={refreshMail}
            disabled={mail.busy || titanConfigured === false}
            title={titanConfigured === false ? "Configure a Titan account in Settings → Accounts first." : undefined}>
            {mail.busy ? "Syncing…" : "Refresh"}
          </button>
        </div>
        <p className="text-slate-500 dark:text-zinc-400 text-xs leading-relaxed">
          Syncs Titan mail into ACUMEN, auto-linking new messages to People.
          {titanConfigured === false && <span className="block text-amber-600 dark:text-amber-400 mt-1">Add a Titan account in Settings → Accounts to enable this.</span>}
        </p>
        {mail.msg && (
          <div className={`text-xs mt-1.5 flex items-start gap-1.5 ${mail.msg.includes("failed") ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
            {!mail.msg.includes("failed") && <IconCheck className="w-3.5 h-3.5 mt-0.5" />}{mail.msg}
          </div>
        )}
      </section>

      <section className="border-t border-slate-100 dark:border-zinc-800 pt-4">
        <div className="flex items-center justify-between gap-3 mb-1">
          <b className={titanConfigured === false ? "text-slate-400 dark:text-zinc-500" : ""}>Refresh calendar</b>
          <button className="btn !py-1 !px-3 text-xs" onClick={refreshCalendar}
            disabled={cal.busy || titanConfigured === false}
            title={titanConfigured === false ? "Configure a Titan account in Settings → Accounts first." : undefined}>
            {cal.busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <p className="text-slate-500 dark:text-zinc-400 text-xs leading-relaxed">
          Reloads Titan calendar events live, showing latest meetings immediately.
          {titanConfigured === false && <span className="block text-amber-600 dark:text-amber-400 mt-1">Add a Titan account in Settings → Accounts to enable this.</span>}
        </p>
        {cal.msg && (
          <div className="text-xs mt-1.5 text-green-600 dark:text-green-400 flex items-start gap-1.5">
            <IconCheck className="w-3.5 h-3.5 mt-0.5" />{cal.msg}
          </div>
        )}
      </section>

      <section className="border-t border-slate-100 dark:border-zinc-800 pt-4">
        <div className="flex items-center justify-between gap-3 mb-1">
          <b>USD to AED exchange rate</b>
          <button className="btn !py-1 !px-3 text-xs" onClick={saveRate} disabled={rateBusy}>
            {rateBusy ? "Saving…" : "Save"}
          </button>
        </div>
        <p className="text-slate-500 dark:text-zinc-400 text-xs leading-relaxed mb-2">One USD equals this many AED. Used for the Accounts graph.</p>
        <div className="flex items-center gap-2">
          <span className="text-sm">1 USD =</span>
          <input className="input !w-32" type="number" min="0.0001" step="0.01" value={rate}
            onChange={(e) => setRate(e.target.value)} aria-label="USD to AED exchange rate" />
          <span className="text-sm">AED</span>
        </div>
        {rateMsg && <div className="text-xs mt-1.5 text-slate-500 dark:text-zinc-400">{rateMsg}</div>}
      </section>

      <section className="border-t border-slate-100 dark:border-zinc-800 pt-4">
        <b className="block mb-1">Theme color</b>
        <p className="text-slate-500 dark:text-zinc-400 text-xs leading-relaxed mb-2.5">
          Changes the highlight color for buttons, links and active nav.
        </p>
        <ThemeColor />
      </section>
    </div>
  );
}

type AssistantField = {
  key: "openaiApiKey" | "geminiApiKey" | "ollamaUrl" | "ollamaModel";
  label: string;
  hint: string;
  secret: boolean;
  placeholder: string;
};

function AssistantTab() {
  const [values, setValues] = useState<Record<string, string>>({
    openaiApiKey: "", geminiApiKey: "", ollamaUrl: "", ollamaModel: "",
  });
  const [configured, setConfigured] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  const fields: AssistantField[] = [
    { key: "openaiApiKey", label: "OpenAI API Key", hint: "Used for chat, summaries, embeddings and voice.", secret: true, placeholder: "sk-…" },
    { key: "geminiApiKey", label: "Gemini API Key", hint: "Optional. Adds a Gemini option to the chat model list.", secret: true, placeholder: "AIza…" },
    { key: "ollamaUrl", label: "Ollama URL", hint: "Base URL for a local Ollama server.", secret: false, placeholder: "http://localhost:11434/v1" },
    { key: "ollamaModel", label: "Ollama model", hint: "Model name to pull from Ollama (enables the Ollama option).", secret: false, placeholder: "qwen2.5:7b" },
  ];

  useEffect(() => {
    fetch("/api/settings/assistant").then((r) => r.json()).then((j) => {
      if (j && !j.error) {
        setValues({
          openaiApiKey: j.openaiApiKey || "",
          geminiApiKey: j.geminiApiKey || "",
          ollamaUrl: j.ollamaUrl || "",
          ollamaModel: j.ollamaModel || "",
        });
        setConfigured(j.configured || {});
      }
    }).catch(() => {});
  }, []);

  async function save() {
    setBusy(true); setMsg("");
    try {
      // Only send secrets if the user changed the (masked) value — avoids
      // overwriting a real key with its masked placeholder.
      const body: Record<string, string> = { ollamaUrl: values.ollamaUrl, ollamaModel: values.ollamaModel };
      if (!configured.openaiApiKey || !values.openaiApiKey.includes("•")) body.openaiApiKey = values.openaiApiKey;
      if (!configured.geminiApiKey || !values.geminiApiKey.includes("•")) body.geminiApiKey = values.geminiApiKey;
      const r = await fetch("/api/settings/assistant", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not save.");
      setValues({
        openaiApiKey: j.openaiApiKey || "",
        geminiApiKey: j.geminiApiKey || "",
        ollamaUrl: j.ollamaUrl || "",
        ollamaModel: j.ollamaModel || "",
      });
      setConfigured(j.configured || {});
      setMsg("Saved — applies immediately, no restart needed.");
    } catch (e: any) {
      setMsg(e?.message || "Could not save.");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
        Configure the AI providers here instead of editing <code>.env</code>. Values set here override the environment and apply instantly. Leave a secret unchanged to keep the current key; clear a field to fall back to <code>.env</code>.
      </p>
      {fields.map((f) => (
        <section key={f.key}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="font-medium" htmlFor={`asst-${f.key}`}>{f.label}</label>
            {f.secret && configured[f.key] && (
              <button className="btn-ghost text-xs" onClick={() => setReveal((r) => ({ ...r, [f.key]: !r[f.key] }))}>
                {reveal[f.key] ? "Hide" : "Show"}
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mb-1.5">{f.hint}</p>
          <input
            id={`asst-${f.key}`}
            className="input font-mono"
            type={f.secret && !reveal[f.key] ? "password" : "text"}
            autoComplete="off"
            placeholder={f.placeholder}
            value={values[f.key]}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          />
        </section>
      ))}
      <div className="flex items-center gap-3 pt-1">
        <button className="btn !py-1.5 text-xs" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        {msg && <span className="text-xs text-slate-500 dark:text-zinc-400">{msg}</span>}
      </div>
    </div>
  );
}



type TitanStatus = { configured: boolean; email: string; source: string | null; retainedLinks: number };

function AccountsTab() {
  const [acct, setAcct] = useState<TitanStatus | null>(null);
  const [form, setForm] = useState({ email: "", password: "" });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirming, setConfirming] = useState(false);

  function load() {
    fetch("/api/settings/titan").then((r) => r.json()).then((j) => {
      if (j && !j.error) setAcct(j);
    }).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  function notify() { window.dispatchEvent(new Event("acumen:titan-changed")); }

  async function save() {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/settings/titan", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not save account.");
      setMsg("Account linked.");
      setEditing(false); setForm({ email: "", password: "" });
      load(); notify();
    } catch (e: any) { setMsg(e?.message || "Could not save account."); }
    finally { setBusy(false); }
  }

  async function remove(mode: "retain" | "delete") {
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`/api/settings/titan?mode=${mode}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not remove account.");
      setMsg(mode === "retain" ? "Account removed; event links retained." : "Account and its event links removed.");
      setConfirming(false);
      load(); notify();
    } catch (e: any) { setMsg(e?.message || "Could not remove account."); }
    finally { setBusy(false); }
  }

  const showForm = editing || !acct?.configured;

  return (
    <div className="flex flex-col gap-4">
      <section>
        <b className="block mb-1">Titan</b>
        <p className="text-slate-500 dark:text-zinc-400 text-xs leading-relaxed mb-3">
          Link your Titan mail and calendar. Stored here (no <code>.env</code> needed). Only one account at a time.
        </p>

        {acct?.configured && !editing && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-700 px-3 py-2.5">
            <span className="text-brand-500"><IconMeeting /></span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{acct.email}</div>
              <div className="text-xs text-slate-400">
                {acct.source === "env" ? "from .env" : "saved in Acumen"}
                {acct.retainedLinks > 0 && ` · ${acct.retainedLinks} linked event${acct.retainedLinks === 1 ? "" : "s"}`}
              </div>
            </div>
            <button className="icon-btn" title="Edit account" onClick={() => { setForm({ email: acct.email, password: "" }); setEditing(true); setMsg(""); }}>
              <IconPencil />
            </button>
            <button className="icon-btn text-red-500" title="Remove account" onClick={() => { setConfirming(true); setMsg(""); }}>
              <IconTrash />
            </button>
          </div>
        )}

        {showForm && (
          <div className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-300 dark:border-zinc-600 p-3">
            <label className="text-xs font-medium" htmlFor="titan-email">Username (email)</label>
            <input id="titan-email" className="input" type="email" autoComplete="off" placeholder="you@example.com"
              value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <label className="text-xs font-medium" htmlFor="titan-pass">Password</label>
            <input id="titan-pass" className="input" type="password" autoComplete="new-password" placeholder="••••••••"
              value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            <div className="flex items-center gap-2 pt-1">
              <button className="btn !py-1.5 text-xs" onClick={save} disabled={busy || !form.email || !form.password}>
                {busy ? "Verifying…" : "Link account"}
              </button>
              {editing && (
                <button className="btn-ghost text-xs" onClick={() => { setEditing(false); setForm({ email: "", password: "" }); setMsg(""); }} disabled={busy}>
                  Cancel
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400">Credentials are verified with a real login before saving.</p>
          </div>
        )}
        {msg && <div className="text-xs mt-2 text-slate-500 dark:text-zinc-400">{msg}</div>}
      </section>

      {confirming && acct?.configured && (
        <div className="rounded-xl border border-red-300 dark:border-red-700 p-3 bg-red-50 dark:bg-red-950/30">
          <div className="text-sm font-medium mb-1">Remove {acct.email}?</div>
          <p className="text-xs text-slate-600 dark:text-zinc-400 mb-3">
            Choose whether to keep this account's event links cached for when it's re-added.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost text-xs" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
            <button className="btn !py-1.5 text-xs" onClick={() => remove("retain")} disabled={busy}>Retain Links</button>
            <button className="btn !py-1.5 text-xs !bg-red-600 hover:!bg-red-700 !text-white" onClick={() => remove("delete")} disabled={busy}>Delete All</button>
          </div>
        </div>
      )}
    </div>
  );
}

