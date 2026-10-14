# ACUMEN — voice-first lightweight CRM (OpenAI)

Chat *is* the CRM: talk/type, it creates Contacts, Projects, Notes, Meetings, links Documents, answers from docs+emails, syncs Titan Mail + Calendar.

## Quickstart

```bash
cd acumen
cp .env.example .env
# edit .env -> set OPENAI_API_KEY
npm install
npx prisma db push
npm run dev
# open http://localhost:3000
```

## Features
- 💬 Chat agent with OpenAI tool-calling (gpt-4o-mini + gpt-4o for RAG answers)
- 🎙️ Voice: mic -> Whisper transcribe -> agent (TTS endpoint at /api/voice/speak)
- 📎 Upload PDF/DOCX/TXT -> auto summary + embeddings + link suggestions
- ❓ Ask: "What did Priya promise?" -> vector search over docs/notes/emails with citations
- 📅 Titan Calendar (CalDAV, read-only): /api/calendar serves live events; Meetings page is a Google-Calendar-style month view
- ✉️ Titan Mail (IMAP, read-only): /api/titan/mail/sync auto-links by sender email
- 🕒 Timeline per Contact/Project: notes + docs + emails

## Try in chat
- "Add Priya Sharma from Zepto, priya@zepto.com, +91-98100-12345"
- "Create project Diwali campaign with Priya, festive push with 15% discount"
- "Log meeting with Priya: agreed 15% discount, follow up Friday, via voice"
- Upload deck.pdf, then "Link deck.pdf to Diwali campaign" then "What pricing was promised?"
- "Schedule review with priya@zepto.com tomorrow 3pm for Diwali campaign"
- "What's in my inbox?" / "What did Titan sync onto my calendar this week?"

## Titan setup (Mail IMAP + Calendar CalDAV, read-only)
1. Set TITAN_EMAIL + TITAN_PASSWORD in .env (see .env.example for the full block).
2. Restart the dev server, press **Mail** / **Cal** in the sidebar to sync.
3. AI reads mail via list_items(kind="emails") + ask_kb, and the calendar LIVE via list_items(kind="meetings") + ask_kb (no local storage — events are read straight from CalDAV each time).
- IMAP: imap.titan.email:993 (override with TITAN_IMAP_HOST if needed).
- CalDAV: https://dav.titan.email (EU: https://dav-eu.titan.email). If discovery fails,
  paste your calendar collection URL into TITAN_CALDAV_CAL_URL.
- Sending mail / creating events is intentionally NOT implemented yet.

## Chat models (OpenAI + Gemini + local Ollama)
The chat composer has a model dropdown. Options come from .env:
- **OpenAI** (always shown, label = OPENAI_CHAT_MODEL).
- **Gemini** — set `GEMINI_API_KEY` (uses Google's OpenAI-compatible endpoint; model via `GEMINI_MODEL`, default gemini-flash-latest). On a rate-limit (429) or unavailable model it automatically falls back down a chain (flash → flash-lite); if all are exhausted it tells you to switch to gpt-4o-mini. Extend via `GEMINI_FALLBACKS`.
- **Local Ollama** — set `OLLAMA_MODEL` (e.g. `qwen2.5:7b`); shows as that model name. Talks to
  `OLLAMA_URL` (default http://localhost:11434/v1). Requires `ollama serve` + the model pulled.
All providers use the same tool-calling agent loop. Restart the server after changing .env.

## Run with Docker / Docker Compose

### Using Docker Compose (default port 8000)
```bash
# Start ACUMEN on port 8000 (database & uploads persist in volumes)
docker compose up -d

# Open in your browser:
# http://localhost:8000
```

To configure your API keys (OpenAI / Gemini / Titan), you can create a `.env` file or simply open the **Settings** menu inside the app UI — keys configured there are persisted directly to the database.

### Build and Run Manually
```bash
docker build -t acumen .
docker run -d -p 8000:8000 -v acumen_data:/app/prisma -v acumen_uploads:/app/uploads acumen
```

> Persistence notes:
> - These volume paths (`/app/prisma` + `/app/uploads`) are canonical. **Do not
>   change them** without also updating every deployed stack file (e.g. Dockge
>   keeps its own copy of `compose.yaml` — editing the repo file alone does
>   nothing to a Dockge-managed container).
> - Schema updates are applied automatically on every container start via
>   `prisma db push` against the schema baked into the image — no manual
>   migration step needed after pulling a new image.

## Switch to Postgres + pgvector later
Change prisma provider to postgresql, DATABASE_URL to Supabase, move DocChunk.embedding to `vector` type. Code in `src/lib/agent2.ts` already isolates similarity — swap cosine loop for `<=>` query.

## Structure
```
src/app/api/chat/route.ts        agent loop
src/app/api/voice/...            whisper + tts
src/app/api/docs/upload/route.ts extract+embed+summarize
src/app/api/titan/...             Titan mail/calendar sync (IMAP + CalDAV)
src/lib/tools.ts                 tool schemas
src/lib/crm.ts + agent2.ts       tool implementations
src/components/...               chat, voice, upload, lists, timeline
prisma/schema.prisma             contacts/projects/notes/tasks/docs/emails
```
