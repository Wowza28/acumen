"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";
import ChatPanel from "@/components/ChatPanel";
import VoiceButton from "@/components/VoiceButton";
import useStagedFiles from "@/components/useStagedFiles";
import StagedBar, { PaperclipButton } from "@/components/AttachBar";
import { IconChip, IconSend } from "@/components/icons";
import { makeAttachSuffix } from "@/lib/attach";
import { chatRuntime } from "@/lib/chatRuntime";

function HomeInner() {
  const sp = useSearchParams();
  const urlChat = sp.get("chat");
  const [chatId, setChatId] = useState<string | null>(urlChat);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<{ id: string; label: string }[]>([{ id: "openai", label: "…" }]);
  const [provider, setProvider] = useState("openai");
  const { staged, add, remove, clear, uploadAll, uploading, dragOver, setDragOver } = useStagedFiles();
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  // Responsive composer placeholder: the Shift+Enter hint is meaningless on
  // touch and the long text clips on narrow screens.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Load available chat models from the server. When none are configured the
  // list is intentionally empty (no fallback) so the selector shows no options;
  // the server replies with a "configure a model" message.
  useEffect(() => {
    fetch("/api/models").then((r) => r.json()).then((j) => {
      const list = Array.isArray(j?.models) ? j.models : [];
      setModels(list);
      try {
        const saved = localStorage.getItem("chat-provider");
        if (saved && list.some((m: any) => m.id === saved)) setProvider(saved);
        else setProvider(list.length ? list[0].id : "");
      } catch { setProvider(list.length ? list[0].id : ""); }
    }).catch(() => {});
  }, []);

  // which thread this UI instance is showing + liveness, so a reply that lands
  // after the user switched away only paints over the thread it belongs to
  const viewRef = useRef<string | null>(urlChat);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadChat = useCallback(async (id: string) => {
    // paint the last-known local snapshot immediately (no blank frame)
    const snap = chatRuntime.snapshots.get(id);
    if (snap) setMessages(snap);
    const pend = chatRuntime.pending.get(id);
    if (pend) {
      // a send for this chat is still running (started before the user switched
      // away) — await the shared promise instead of showing an unanswered prompt
      setChatId(id);
      setLoading(true);
      const final = await pend;
      chatRuntime.pending.delete(id);
      if (mountedRef.current && viewRef.current === id) {
        setMessages(final);
        setLoading(false);
      }
      return;
    }
    const j = await fetch(`/api/chats/detail?id=${id}`).then((r) => r.json()).catch(() => null);
    const msgs = Array.isArray(j?.messages)
      ? j.messages.map((m: any) => ({ role: m.role, content: m.content }))
      : [];
    setMessages(msgs);
    if (msgs.length) chatRuntime.snapshots.set(id, msgs);
    setChatId(id);
    setLoading(false);
  }, []);

  useEffect(() => {
    viewRef.current = urlChat;
    if (urlChat) loadChat(urlChat);
    else { setChatId(null); setMessages([]); setLoading(false); }
  }, [urlChat, loadChat]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if ((!content && !staged.length) || loading || uploading) return;
    // first upload staged files, then send chat with filenames as context
    let filesSuffix = "";
    if (staged.length) {
      const up = await uploadAll();
      clear();
      // suffix is added ONLY to what the AI sees (it's part of the prompt) —
      // ChatPanel strips it before rendering so the user never sees it
      filesSuffix = makeAttachSuffix(up.map((f) => f.filename));
    }
    const fullContent = content + filesSuffix;
    const sentTo = chatId; // thread this message belongs to (null = brand-new)
    const next = [...messages, { role: "user", content: fullContent }];
    setMessages(next); setInput(""); setLoading(true);
    if (sentTo) chatRuntime.snapshots.set(sentTo, next);
    // snap the composer back to its single-line height immediately after send
    // (it otherwise stays stretched until the next keystroke re-sizes it)
    requestAnimationFrame(() => { if (boxRef.current) boxRef.current.style.height = "auto"; });

    // Register the in-flight send under a provisional key so switching away
    // and back can still find it. The server runs the model and its tool
    // calls (create/edit objects) to completion regardless of navigation —
    // this promise only carries the RESULT back to whichever thread it is for.
    const provisionalKey = sentTo ?? `new-${Date.now()}`;
    let work!: Promise<{ role: string; content: string }[]>;
    work = (async () => {
      const r = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, chatId: sentTo, provider })
      });
      const j = await r.json();
      const final = [...next, { role: "assistant", content: j.reply || j.error }];
      if (j.chatId && !sentTo) {
        // brand-new thread: re-key under the real id the server assigned
        chatRuntime.pending.set(j.chatId, work);
      }
      const realId: string | null = j.chatId || sentTo;
      if (realId) chatRuntime.snapshots.set(realId, final);
      chatRuntime.pending.delete(provisionalKey);
      // only repaint if the user is still looking at the thread this belongs to
      if (mountedRef.current && viewRef.current === sentTo) {
        setMessages(final);
        setLoading(false);
        if (j.chatId && j.chatId !== sentTo) {
          setChatId(j.chatId);
          viewRef.current = j.chatId;
          window.history.replaceState(null, "", `/?chat=${j.chatId}`);
        }
      }
      window.dispatchEvent(new Event("chats-changed"));
      return final;
    })().catch((e: any) => {
      const final = [...next, { role: "assistant", content: "Error: " + e.message }];
      if (sentTo) chatRuntime.snapshots.set(sentTo, final);
      chatRuntime.pending.delete(provisionalKey);
      if (mountedRef.current && viewRef.current === sentTo) {
        setMessages(final);
        setLoading(false);
      }
      return final;
    });

    chatRuntime.pending.set(provisionalKey, work);
  }

  return (
    <Shell wide>
      <div
        className="max-w-3xl mx-auto w-full flex flex-col min-h-[calc(100vh-6rem)]"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) add(e.dataTransfer.files); }}
      >
        {dragOver && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 pointer-events-none">
            <div className="card text-sm font-medium">Drop files to attach</div>
          </div>
        )}
        <div className="flex-1">
          <ChatPanel messages={messages} loading={loading || uploading} />
        </div>
        <div className="sticky bottom-0 pb-5 pt-2 bg-white dark:bg-zinc-950">
          <StagedBar staged={staged} onRemove={remove} />
          <div className="flex items-center gap-1 border border-brand-500/50 dark:border-brand-400/50 rounded-2xl px-2 py-1.5 bg-white dark:bg-zinc-900 shadow-sm">
            <PaperclipButton onPick={(f) => add(f)} />
            {/* Model picker: a small chip icon button with a transparent native
                select layered over it — tapping opens the OS model picker
                (ideal on mobile), and native lists size themselves to the
                longest model name, so no truncation. Saves the composer a
                whole column of width for the message text. */}
            <div className="relative group" title="Chat model">
              <span className="icon-btn inline-flex items-center justify-center group-hover:bg-slate-100 dark:group-hover:bg-zinc-800">
                <IconChip />
              </span>
              <select
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Chat model"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  try { localStorage.setItem("chat-provider", e.target.value); } catch {}
                }}
              >
                {models.length === 0 && <option value="">No model</option>}
                {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <textarea
              ref={boxRef}
              className="flex-1 min-w-0 bg-transparent outline-none text-sm px-2 py-2 resize-none max-h-40"
              rows={1} value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder={isMobile ? "Message…" : "Message… (Shift+Enter for new line)"} />
            <VoiceButton onTranscript={(t) => send(t)} />
            <button className="icon-btn text-brand-500 hover:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/15" onClick={() => send()} disabled={loading} title="Send"><IconSend /></button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

export default function Home() {
  return <Suspense><HomeInner /></Suspense>;
}
