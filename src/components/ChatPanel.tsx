"use client";
import { IconFile } from "@/components/icons";
import { splitAttachments } from "@/lib/attach";

function renderInline(text: string, keyPrefix: string) {
  // minimal **bold** renderer (no dependency)
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
      return <strong key={`${keyPrefix}-${i}`}>{p.slice(2, -2)}</strong>;
    }
    return <span key={`${keyPrefix}-${i}`}>{p}</span>;
  });
}

export default function ChatPanel({ messages, loading }: { messages: { role: string; content: string }[]; loading: boolean }) {
  if (messages.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center text-center px-4 py-24">
        <h2 className="text-2xl font-semibold tracking-tight">Good day.</h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">What would you like to do?</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5 py-6 max-w-3xl mx-auto w-full">
      {messages.map((m, i) => (
        m.role === "user" ? (() => {
          // hide the internal "[Attached files: …]" prompt suffix from the
          // user — show friendly attachment chips instead
          const { text, files } = splitAttachments(m.content);
          return (
            <div key={i} className="chat-bubble-user">
              {text && <div className="whitespace-pre-wrap text-sm">{text}</div>}
              {files.length > 0 && (
                <div className={`flex flex-wrap gap-1.5 ${text ? "mt-2" : ""}`}>
                  {files.map((f, fi) => (
                    <span key={fi} className="inline-flex items-center gap-1 text-xs bg-white/15 dark:bg-black/25 rounded-lg px-2 py-1 max-w-[220px]">
                      <IconFile />
                      <span className="truncate">{f}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })() : (
          <div key={i} className="chat-bubble-ai">
            <div className="whitespace-pre-wrap leading-relaxed">
              {m.content.split("\n").map((line, li) => (
                <p key={li} className="mb-2 last:mb-0">{renderInline(line || " ", `${i}-${li}`)}</p>
              ))}
            </div>
          </div>
        )
      ))}
      {loading && <div className="chat-bubble-ai text-sm animate-pulse">Thinking…</div>}
    </div>
  );
}
