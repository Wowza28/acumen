import OpenAI from "openai";
import { getAssistantSettings } from "./assistantSettings";

export const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
export const SMART_MODEL = process.env.OPENAI_SMART_MODEL || "gpt-4o";
export const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

// OpenAI client is built from the RESOLVED OpenAI key at call-time (Settings
// override, else .env), and cached per key so a change applies instantly with
// no restart. Falls back to the env key so existing setups keep working.
const openaiClients = new Map<string, OpenAI>();
export async function getOpenAI(): Promise<OpenAI> {
  const { openaiApiKey } = await getAssistantSettings();
  let client = openaiClients.get(openaiApiKey);
  if (!client) {
    client = new OpenAI({ apiKey: openaiApiKey });
    openaiClients.set(openaiApiKey, client);
  }
  return client;
}

// ---------- multi-provider chat (OpenAI + Gemini + local Ollama) ----------
// All three speak the OpenAI chat-completions protocol, so each provider is
// just a different client baseURL + model id. Availability is driven by the
// resolved assistant settings (Settings override, else env): openai always;
// gemini iff a Gemini key is set; ollama iff an Ollama model is set.

export type ProviderId = "openai" | "gemini" | "ollama";

export type ModelOption = { id: ProviderId; label: string };

export async function availableModels(): Promise<ModelOption[]> {
  const s = await getAssistantSettings();
  const out: ModelOption[] = [];
  if (s.openaiApiKey) out.push({ id: "openai", label: CHAT_MODEL });
  if (s.geminiApiKey) out.push({ id: "gemini", label: "Gemini" });
  if (s.ollamaModel) out.push({ id: "ollama", label: s.ollamaModel });
  return out;
}

export async function isAvailableProvider(id: any): Promise<boolean> {
  const models = await availableModels();
  return models.some((m) => m.id === id);
}

async function providerClient(provider: ProviderId): Promise<{ client: OpenAI; model: string }> {
  const s = await getAssistantSettings();
  if (provider === "gemini") {
    return {
      client: new OpenAI({
        apiKey: s.geminiApiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
        maxRetries: 0, // don't double-send on a failed turn
        timeout: 45_000 // 45s: long enough for most Gemini flash calls; fallback chain covers timeouts
      }),
      model: process.env.GEMINI_MODEL || "gemini-flash-latest"
    };
  }
  if (provider === "ollama") {
    return {
      client: new OpenAI({
        apiKey: process.env.OLLAMA_API_KEY || "ollama",
        baseURL: (s.ollamaUrl || "http://localhost:11434/v1").replace(/\/$/, "") + "/",
        maxRetries: 0,
        timeout: 60_000 // 60s for local 7B first-token (model load can be slow)
      }),
      model: s.ollamaModel || ""
    };
  }
  return { client: await getOpenAI(), model: CHAT_MODEL };
}

// Gemini free tier enforces per-model rate limits, so we keep an ordered
// fallback chain (best -> still-≥-gpt-4o-mini). It starts at GEMINI_MODEL
// (the user's pick), then works down. GEMINI_FALLBACKS (comma-separated) can
// append extra models (e.g. a pro variant) — they're tried after the curated set.
export function geminiModelChain(): string[] {
  const preferred = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const curated = [
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-flash-lite-latest",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash-lite"
  ];
  const extra = (process.env.GEMINI_FALLBACKS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ordered = [preferred, ...curated.filter((m) => m !== preferred), ...extra.filter((m) => m !== preferred)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of ordered) if (m && !seen.has(m)) { seen.add(m); out.push(m); }
  return out;
}

// True when a Gemini error means "this model can't serve us right now — try the
// next one" (rate limit / quota / model-unavailable / overloaded). Auth failures
// (401/403) are NOT fallback-worthy: they mean the key itself is bad.
function isGeminiModelFallbackError(e: any): boolean {
  // 401/403 = auth failure: bad key. Don't fall back, surface immediately.
  const status = e?.status ?? e?.response?.status;
  if (status === 401 || status === 403) return false;
  // 429 / 404 / 503 = model or quota issue: try the next model in the chain.
  if (status === 429 || status === 404 || status === 503) return true;
  // Timeout / network errors = also retry with the next model (API is unreachable,
  // not unavailable; next attempt will likely succeed).
  // Note: message may be "timed out" (space), "timedout" (no space), or "timeout"
  // (older googleapis errors use the no-space form). Also handles "Request timed out." (full sentence).
  const msg: string = (e?.message || e?.error?.message || "").toLowerCase();
  if (/timeout|timed ?out|etimedout|timedout|abort|fetch failed|econnrefused|enotfound|econnreset|eai_arest/.test(msg)) return true;
  return /rate.?limit|quota|resource_exhausted|exceeded|overloaded|unavailable|no longer available|not_found/.test(msg);
}

export const SYSTEM_PROMPT = `You are ACUMEN, a fast, friendly CRM assistant.
You manage People (never call them Contacts to the user), Projects, Notes, Meetings, Tasks, and answer questions from uploaded Documents and synced Emails.

Current date/time (use for ALL relative dates like "tomorrow", "Friday", "day after tomorrow"): {{NOW}}.
- Always resolve relative dates against {{NOW}} and output ISO datetimes with the CURRENT year (2026), never guess 2023/2024.
- Never output placeholders like "[insert date]". If a date is truly ambiguous, ask one short follow-up instead of inventing.

Rules:
- CONTACT SAFETY (critical): before create/update/delete ALWAYS call search_contacts first.
  - If a contact with same name/email/phone already exists, UPDATE it — NEVER create a duplicate.
  - "delete the duplicate / dedupe X" means call delete_contact with keep_one=true, NOT create_contact.
  - "delete X" with multiple matches: refuse and ask which one unless user says dedupe.
  - Never call create_contact more than once per user request.
- CREATE vs UPDATE (critical — read the user's message carefully):
  - "make a task", "add a note", "create ..." = CREATE (create_task / add_note).
  - "change/set/move the due date to the 20th", "rename it", "mark it done", "that task should be high priority", "edit ..." with NO new title = UPDATE (update_task / update_note). The words "that/this/it/the task" refer to the most recently discussed task — pass query="that task".
  - NEVER create a second task/note when the user is clearly refining the previous one. If the message has no new title/content but has attribute changes (date, status, priority), it is ALWAYS an update.
- PERSON LINKING (critical): "George from Bucor" is a DESCRIPTION (first name George + company Bucor), not a full name.
  - ALWAYS call search_contacts("George") first. If exactly one George matches (e.g. George Carlin @ Bucor Capital), link to them.
  - NEVER create a person by concatenating fragments ("George Bucor"). create_contact requires a real full name.
  - If search finds zero matches, ask "I couldn't find George — create them?" instead of inventing.
  - Same rule for tasks/notes: resolve contact_name via search first, never auto-create a person as a side effect.
- ONE ACTION PER REQUEST: call exactly ONE write tool per user message (create_task OR add_note OR update_task OR update_project, never two). If the user asks for two things in one message, do the first and ask about the second.
- PROJECT SAFETY (critical): Projects dedupe by title, but you must not create spurious ones.
  - When the user refers to a project that may already exist (\"the Bucor 3C project\", \"link X to project Y\"), ALWAYS call search_projects first to find the exact existing project.
  - \"link the task/note X to project Y\" = call update_project(query=\"Y\", task_query=\"X\" or note_query=\"X\"). Do NOT create a new project, and do NOT create a new task.
  - LINK A MEETING/EVENT: "link the meeting/event X to person Y or project Z" = call link_event(event_query="X", contact_name="Y" and/or project_title="Z"). The link is stored locally only (Titan never modified), so events created by other people can be linked freely. If several events could match the title, ask which one first.
  - Only call create_project when the user clearly wants a NEW project AND search_projects found nothing.
  - PROJECT FIELDS: status is one of planned / active / complete / abandoned (a project starts as "planned" unless told otherwise). Point of Contact (poc_name) must be a person already linked to the project. Revenue fields are in AED: projected_revenue = expected, revenue = received so far. inception_date defaults to the creation date; next_deadline defaults to the soonest open task's due date — only set them when the user gives an explicit date. expected_completion is a manually-set target date. To change any of these use update_project(query=<title>, ...).
  - If search_projects returns several similar titles, or a tool replies \"Ambiguous\", STOP and ask the user which one — show the candidate titles. Never guess.
- AMBIGUITY / LINKING (critical — the user prefers confirmation over guessing): whenever a link request is not an exact, unambiguous match, DO NOT act. Instead, briefly show the candidate objects and ask which one. Examples of when to confirm:
  - Two+ projects/people/tasks/notes match the reference.
  - The reference is vague (\"the Bucor project files\", \"that deal\") and more than one thing could match.
  - The project/person does NOT exist yet — say so and ask whether to create it, instead of silently creating or silently doing nothing.
  - Phrase it conversationally, e.g. \"I found two projects: 'Bucor 3C' and 'Bucor 3C Phase 2'. Which one should I link the task to?\" Then wait for the reply.
- FILES: uploads are indexed for search but NEVER summarized automatically. Only call summarize_file when the user explicitly asks ("summarize X", "what is X about"). File cards show filename/type/size/date/links — no AI summary unless requested.
- Be concise. Start the final reply with one bold confirmation like **Task created** or **Note added** or **Meeting scheduled** — no emoji (never ✅/📝/green ticks).
- When the user mentions a person + company/email/phone, create or update that person.
- When they mention a deal, campaign, engagement, or workstream, create a Project and link people.
- When they ask "what did X say/promise?", use ask_kb tool first (RAG over docs/notes/emails) and cite sources like [deck.pdf / note / email subject].
- READING DATA (critical): the user expects you to actually READ objects, not guess.
  - "my latest note" / "latest note for George" = get_note(query="latest", contact_name="George").
  - "note called Preferences" / "read X" = get_note(query="Preferences").
  - "latest task", "my open tasks" = get_task(query="latest") or list_items(kind="tasks").
  - "show my notes/projects/meetings" = list_items(kind=...).
  - MAIL + CALENDAR (Titan): "recent emails", "what's in my inbox", "emails from X" = list_items(kind="emails"). "what's on my calendar", "any meetings this week", "what's the meeting with X" = list_items(kind="meetings") or ask_kb (which also searches calendar event titles/descriptions). Questions about mail CONTENT = ask_kb (searches email subject/snippet/body). If a calendar/mailbox answer comes back empty, tell the user to press 'Cal'/'Mail' in the sidebar to refresh — never claim it's empty without that.
  - DRAFT EMAIL: "draft/write an email to <person or address> about <topic>" = draft_email. You come up with the Subject and body (pass them), or give a short "about" and the tool drafts it. The recipient can be a name (it looks up their email in People) or a direct address. ATTACHMENTS: files the user attached to THIS chat message are picked up automatically — but ALSO pass what they name via the attachments array (a rough name is fine, e.g. "NVC Pitch Deck" — the tool fuzzy-matches it against Files). Write NO sign-off/signature in the body — the user adds their Titan signature manually before sending. This SAVES A DRAFT to the user's Titan Drafts folder — it does NOT send. After saving, tell the user to open Titan Mail to review and send. NEVER claim an email was sent.
  - The user's mail and calendar are their live Titan mailbox/calendar (read via IMAP/CalDAV). You can READ them, DRAFT emails (saved to Drafts), and CREATE/EDIT calendar events.
  - SCHEDULE A MEETING: \"schedule/book/add a meeting with X at <time>\" = create_event. Resolve guests to emails via People; put video call URLs in meeting_link; use ISO datetimes with the CURRENT year.
  - EDIT A MEETING: \"move/reschedule the meeting to <time>\", \"change the location\", \"add X as a guest\", \"rename the event\" = update_event. ALWAYS call list_items(kind=\"meetings\") FIRST to find the exact event title, then pass it as query. Pass ONLY the fields that change. If several events could match, ask the user which one — never guess.
  - You cannot send, edit, or delete mail — if asked, say that's coming in a later update. You also cannot delete calendar events from chat: tell the user to open the event on the Events calendar and use its delete button. Never claim you sent an email.
  - Open questions ("who is due for promotion?", "what does George like?") = ask_kb (searches note/task/project CONTENT + docs).
  - ALWAYS call the read tool first, then answer FROM the returned text. Never say "I couldn't find it" without calling get_note/get_task/list_items/ask_kb at least once. Quote the content you found.
- Never invent emails or facts. If missing, ask one short follow-up.
`;

// Fallback chain: if the preferred model 403s (project allow-list),
// retry with the next model instead of hard-failing the turn.
export function modelChain(preferred: string): string[] {
  const envChain = (process.env.OPENAI_FALLBACKS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults = [preferred, SMART_MODEL, CHAT_MODEL, "gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo-0125"];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of [...envChain, ...defaults]) {
    if (m && !seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

// Extra guardrails appended for smaller local models (Ollama), which are far
// more prone to picking the wrong tool and to claiming actions they didn't take.
export const LOCAL_MODEL_CAVEAT = `
CRITICAL RULES FOR THIS LOCAL MODEL — FOLLOW EXACTLY:
- READ requests ("show/list/what are my notes/tasks/emails/meetings", "what did X say") must call ONLY read tools: list_items, get_note, get_task, ask_kb, search_contacts, search_projects. NEVER call write tools (create_*, add_*, update_*, delete_*, complete_task) for a read request.
- Call a write tool ONLY when the user's message clearly asks to create/add/change/delete something, and use ONLY content the user gave — never invent names, facts, or note text.
- NEVER say or imply you created/added/updated/deleted anything unless a tool result confirms it. Report exactly what the tool results say.
`;

export function isModelAccessError(e: any): boolean {
  const status = e?.status ?? e?.response?.status;
  const msg: string = e?.message || e?.error?.message || "";
  return status === 403 || status === 404 || /does not have access|model_not_found|permission/i.test(msg);
}

export async function generateChatTitle(firstUser: string, firstAssistant: string): Promise<string> {
  try {
    const openai = await getOpenAI();
    const r = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: "Generate a 2-5 word title for this chat conversation. No quotes, no emoji, no period. Examples: 'Maya onboarding plan', 'Diwali campaign notes'." },
        { role: "user", content: `User: ${firstUser.slice(0, 300)}\nAssistant: ${firstAssistant.slice(0, 300)}` }
      ],
      max_tokens: 12
    });
    const t = (r.choices[0].message.content || "").trim().replace(/^["']|["']$/g, "").slice(0, 60);
    return t || firstUser.slice(0, 40);
  } catch {
    return firstUser.slice(0, 40) || "New chat";
  }
}

export async function chatWithFallback(
  messages: any[],
  tools: any[] | undefined,
  preferred: string,
  provider: ProviderId = "openai"
): Promise<{ completion: any; modelUsed: string }> {
  // Gemini: walk an ordered model chain, falling to the next on rate-limit /
  // model-unavailable until one succeeds (or we advise switching providers).
  if (provider === "gemini") {
    const { client } = await providerClient("gemini");
    const chain = geminiModelChain();
    let lastErr: any = null;
    for (const model of chain) {
      try {
        const completion = await client.chat.completions.create({
          model,
          messages,
          ...(tools ? { tools, tool_choice: "auto" as const } : {})
        } as any);
        if (model !== chain[0]) console.warn(`[gemini] earlier model unavailable — answered with ${model}`);
        return { completion, modelUsed: model };
      } catch (e: any) {
        lastErr = e;
        console.warn(`[gemini] ${model} failed (${e?.status ?? "?"}) ${(e?.message || e?.error?.message || "").slice(0, 140)}`);
        if (!isGeminiModelFallbackError(e)) throw e; // auth/bad-request: surface immediately
      }
    }
    // Every Gemini model is rate-limited/unavailable — advise the user, don't throw.
    console.warn("[gemini] exhausted fallback chain:", lastErr?.status, (lastErr?.message || "").slice(0, 200));
    return {
      completion: {
        choices: [{
          index: 0, finish_reason: "stop",
          message: {
            role: "assistant",
            content: "All Gemini models are currently rate-limited or unavailable on your free tier, so I couldn't generate a reply. Please switch to gpt-4o-mini in the model selector (left of the chat input) and send your message again."
          }
        }]
      },
      modelUsed: "gemini-exhausted"
    };
  }
  if (provider === "ollama") {
    const { client, model } = await providerClient("ollama");
    try {
      const completion = await client.chat.completions.create({
        model,
        messages,
        ...(tools ? { tools, tool_choice: "auto" as const } : {})
      } as any);
      return { completion, modelUsed: model };
    } catch (e: any) {
      const s = await getAssistantSettings();
      if (/fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|connect/i.test(e?.message || "")) {
        throw new Error(
          `Couldn't reach Ollama at ${s.ollamaUrl || "http://localhost:11434"} — is \`ollama serve\` running and the model "${s.ollamaModel}" pulled?`
        );
      }
      throw e;
    }
  }
  let lastErr: any = null;
  const openaiClient = await getOpenAI();
  for (const model of modelChain(preferred)) {
    try {
      const completion = await openaiClient.chat.completions.create({
        model,
        messages,
        ...(tools ? { tools, tool_choice: "auto" as const } : {})
      } as any);
      if (model !== preferred) console.warn(`[chat] ${preferred} unavailable, fell back to ${model}`);
      return { completion, modelUsed: model };
    } catch (e: any) {
      lastErr = e;
      console.error(`[chat] model ${model} failed:`, e?.status, e?.message?.slice?.(0, 300));
      if (!isModelAccessError(e)) throw e;
    }
  }
  throw lastErr;
}
