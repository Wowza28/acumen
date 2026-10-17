# ACUMEN — voice-first lightweight CRM

Chat *is* the CRM: talk/type, it creates Contacts, Projects, Notes, Tasks and
calendar events, links Documents, answers from docs+emails, syncs Titan Mail +
Calendar, and tracks bank-statement Transactions.

## Prerequisites

- Node.js 22 (Docker image uses `node:22-bookworm-slim`), Next.js 14.2.x, React 18
- At least one chat provider key: OpenAI (`OPENAI_API_KEY`) or Gemini
  (`GEMINI_API_KEY`), or a local Ollama model (`OLLAMA_MODEL` + `ollama serve`)

## Quickstart

```bash
cd acumen
cp .env.example .env
# edit .env -> set OPENAI_API_KEY (or configure later in Settings → Assistant)
npm install        # postinstall also runs `prisma generate` + copies pdf.js assets to public/pdf
npx prisma db push # create ./dev.db (SQLite) from prisma/schema.prisma
npm run dev
# open http://localhost:3000
```

Scripts: `npm run dev` (local dev) · `npm run build` (`prisma generate` +
`next build`) · `npm start` (`next start`) · `npm run prisma:push`
· `npm run prisma:studio`.

## Features
- 💬 Chat agent with tool-calling (default `OPENAI_CHAT_MODEL=gpt-4o-mini`;
  RAG answers upgrade to `OPENAI_SMART_MODEL=gpt-4o`). Up to 6 tool rounds per
  turn, one write-tool execution per tool per turn.
- 🎙️ Voice: mic -> Whisper (`POST /api/voice/transcribe`) -> agent; TTS at
  `POST /api/voice/speak` (OpenAI `tts-1`, ≤4000 chars).
- 📎 Upload PDF/DOCX/TXT/CSV-ish text (`POST /api/docs/upload`) -> text
  extract + embeddings + link suggestions. Summaries are on-demand only
  (`summarize_file` in chat), never at upload time.
- ❓ Ask: "What did Priya promise?" -> cosine search over doc chunks, notes,
  tasks, projects and synced emails with citations.
- 📅 Titan Calendar (CalDAV): live events via `GET /api/calendar`; create/edit/
  delete from the Events page or chat (`create_event`/`update_event`). Event
  links to people/projects are local-only `EventLink` rows — Titan is never
  modified for linking.
- ✉️ Titan Mail (IMAP): `GET /api/titan/mail/sync` stores only new messages
  into `SyncedEmail`, auto-linked by sender email. The agent can also save a
  review-ready message to the Titan Drafts folder (`draft_email`); sending
  from inside Acumen is not supported.
- 🕒 Timeline per Contact/Project: notes + docs + emails.
- 💳 Accounts: bank-statement CSV import (columns F–N, DD/MM/YYYY, dedupe by
  reference), ledger with VAT exclusions, per-project Revenue (directly linked
  transactions ÷ 1.05, USD converted at the Settings rate).

## Try in chat
- "Add Priya Sharma from Zepto, priya@zepto.com, +91-98100-12345"
- "Create project Diwali campaign with Priya, festive push with 15% discount"
- "Log meeting with Priya: agreed 15% discount, follow up Friday, via voice"
- Upload deck.pdf, then "Link deck.pdf to Diwali campaign" then "What pricing was promised?"
- "Schedule review with priya@zepto.com tomorrow 3pm for Diwali campaign"
- "What's in my inbox?" / "What did Titan sync onto my calendar this week?"

## Titan setup (Mail IMAP + Calendar CalDAV)
1. Add your account in **Settings → Accounts** (credentials are verified with
   a real login before saving), or set `TITAN_EMAIL` + `TITAN_PASSWORD` in
   `.env` (see `.env.example` for the full block).
2. Restart the dev server after `.env` changes. Open the **Events** page to
   read the live calendar; trigger a mail sync from
   **Settings → Accounts → Sync now** (`GET /api/titan/mail/sync`).
3. AI reads mail via `list_items(kind="emails")` + `ask_kb`, and the calendar
   LIVE via `list_items(kind="meetings")` + `ask_kb` (events are read straight
   from CalDAV each time; only explicit person/project links are stored
   locally). The agent can create/edit/delete events and save email drafts to
   the Titan Drafts folder for you to send.
- IMAP: `imap.titan.email:993` (override with `TITAN_IMAP_HOST` if needed).
- CalDAV: `https://dav.titan.email` (EU: `https://dav-eu.titan.email`). If
  discovery fails, paste your calendar collection URL into
  `TITAN_CALDAV_CAL_URL`.
- Mail sync walks `TITAN_SYNC_MAX_BATCHES` batches of `TITAN_MAIL_LIMIT`
  envelopes newest→oldest and downloads only new messages; the calendar window
  defaults to `TITAN_CAL_DAYS_PAST`/`TITAN_CAL_DAYS_FUTURE` (30/60).

## Chat models (OpenAI + Gemini + local Ollama)
The chat composer has a model dropdown. Options come from Settings → Assistant
(DB `AppSetting`, applied instantly) falling back to `.env`:
- **OpenAI** (shown when `OPENAI_API_KEY` is set, label = `OPENAI_CHAT_MODEL`).
- **Gemini** — set `GEMINI_API_KEY` (uses Google's OpenAI-compatible endpoint; model via `GEMINI_MODEL`, default gemini-flash-latest). On a rate-limit (429) or unavailable model it automatically falls back down a chain (flash → flash-lite); if all are exhausted it tells you to switch to gpt-4o-mini. Extend via `GEMINI_FALLBACKS`.
- **Local Ollama** — set `OLLAMA_MODEL` (e.g. `qwen2.5:7b`); shows as that model name. Talks to
  `OLLAMA_URL` (default http://localhost:11434/v1). Requires `ollama serve` + the model pulled.
All providers use the same tool-calling agent loop. `.env` changes need a
restart; Settings changes apply instantly. With no provider configured, chat
replies "No models configured…" (see `NO_MODELS_MESSAGE`).

## Environment variables (all in `.env.example`)
| Variable | Used for |
| --- | --- |
| `OPENAI_API_KEY` | Chat, RAG answers, embeddings, Whisper, TTS (or set in Settings → Assistant) |
| `OPENAI_CHAT_MODEL` | Default chat model (`gpt-4o-mini`) |
| `OPENAI_SMART_MODEL` | Model for RAG-grounded answers (`gpt-4o`) |
| `OPENAI_EMBED_MODEL` | Doc-chunk embeddings (`text-embedding-3-small`) |
| `GEMINI_API_KEY` / `GEMINI_MODEL` / `GEMINI_FALLBACKS` | Optional Gemini provider + fallback chain |
| `OLLAMA_MODEL` / `OLLAMA_URL` (`OLLAMA_API_KEY` optional, default `ollama`) | Optional local provider |
| `DATABASE_URL` | SQLite file (`file:./dev.db` local; `file:/app/prisma/dev.db` in Docker) |
| `TITAN_EMAIL` / `TITAN_PASSWORD` | Titan account fallback when none is saved in Settings → Accounts |
| `TITAN_IMAP_HOST` | IMAP host (`imap.titan.email:993`) |
| `TITAN_CALDAV_URL` / `TITAN_CALDAV_CAL_URL` | CalDAV base URL / optional direct calendar collection URL |
| `TITAN_MAIL_LIMIT` / `TITAN_SYNC_MAX_BATCHES` | Mail sync batch size / batches per sync |
| `TITAN_CAL_DAYS_PAST` / `TITAN_CAL_DAYS_FUTURE` | Calendar window for agent reads |
| `PORT` / `UPLOAD_DIR` | Runtime port + upload dir (Docker: `8000` / `/app/uploads`) |

## Run with Docker / Docker Compose

### Using Docker Compose (default port 8000)
```bash
# Start ACUMEN on port 8000 (database & uploads persist in ./data bind mounts)
docker compose up -d

# Open in your browser:
# http://localhost:8000
```

To configure your API keys (OpenAI / Gemini / Titan), you can create a `.env` file or simply open the **Settings** menu inside the app UI — keys configured there are persisted directly to the database.

### Build and Run Manually
```bash
docker build -t acumen .
mkdir -p data/db data/uploads
docker run -d -p 8000:8000 -v ./data/db:/app/prisma -v ./data/uploads:/app/uploads acumen
```

> Persistence notes:
> - ALL persistent data lives in `./data/` next to `compose.yaml` via bind
>   mounts (`./data/db` = SQLite database, `./data/uploads` = uploaded files).
>   The container-side paths (`/app/prisma` + `/app/uploads`) are canonical —
>   **do not change them** without also updating every deployed stack file
>   (e.g. Dockge keeps its own copy of `compose.yaml` — editing the repo file
>   alone does nothing to a Dockge-managed container; paste the updated file
>   into Dockge).
> - `data/` contents are git-ignored (only `.gitkeep` markers are tracked), so
>   your CRM data is never committed.
> - Schema updates are applied automatically on every container start via
>   `prisma db push` against the schema baked into the image — no manual
>   migration step needed after pulling a new image.

## Switch to Postgres + pgvector later
Change prisma provider to postgresql, DATABASE_URL to Supabase, move DocChunk.embedding to `vector` type. RAG similarity is isolated in `src/lib/rag.ts:cosine` (+ `src/lib/agent2.ts:toolAskKb`) — swap the cosine loop for a `<=>` query.

## Structure
```
src/app/page.tsx                 chat home (composer, model picker, attachments, voice)
src/app/api/chat/route.ts        agent loop (persist turn → ≤6 tool rounds → persist reply)
src/app/api/voice/...            whisper transcribe + tts speak
src/app/api/docs/upload/route.ts extract+embed+suggest-links (no summary at upload)
src/app/api/calendar/route.ts    live Titan CalDAV window + create/edit/delete
src/app/api/titan/mail/sync/...  IMAP sync (new messages only, auto-link by sender)
src/app/api/transactions/...     statement CSV import + ledger (+ transaction-links/tags/vat-exclusions)
src/lib/tools.ts                 tool schemas (names consumed by the model)
src/lib/crm.ts + agent2.ts       tool implementations (fuzzy resolve, dates, RAG, drafts, events)
src/lib/openai.ts                providers (OpenAI/Gemini/Ollama) + fallback chains + system prompt
src/lib/titan.ts                 IMAP + CalDAV (discovery, fetch/create/update/delete, drafts)
src/lib/rag.ts                   chunk + embed + cosine (swap point for pgvector)
src/components/...               ChatPanel, Shell/Sidebar/Settings, Events calendar, Accounts ledger,
                                 People/Projects/Tasks/Notes/Files pages, viewers, drawers
prisma/schema.prisma             contacts(+emails/phones)/projects/notes/tasks/documents+chunks/
                                 chats/emails(Titan)/events-links/transactions+links/vat/settings
```
