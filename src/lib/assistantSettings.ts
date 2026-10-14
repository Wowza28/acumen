import { prisma } from "./db";

// Runtime-configurable assistant (AI provider) settings. Stored in the
// AppSetting table so users can set them in the Settings window instead of
// editing .env. Values fall back to environment variables when not overridden
// (empty DB value == "use env"), so existing .env setups keep working.
//
// The cache is invalidated the moment settings are saved (see the settings
// API), so changes apply instantly — no server restart needed.

export type AssistantSettings = {
  openaiApiKey: string;
  geminiApiKey: string;
  ollamaUrl: string;
  ollamaModel: string;
};

type AssistantKey = keyof AssistantSettings;

const KEYS: Record<AssistantKey, string> = {
  openaiApiKey: "openaiApiKey",
  geminiApiKey: "geminiApiKey",
  ollamaUrl: "ollamaUrl",
  ollamaModel: "ollamaModel",
};

function envFor(k: AssistantKey): string {
  switch (k) {
    case "openaiApiKey": return process.env.OPENAI_API_KEY || "";
    case "geminiApiKey": return process.env.GEMINI_API_KEY || "";
    case "ollamaUrl": return process.env.OLLAMA_URL || "";
    case "ollamaModel": return process.env.OLLAMA_MODEL || "";
  }
}

let cache: { at: number; data: AssistantSettings } | null = null;
const TTL = 3000; // safety-net freshness window; explicit invalidation is primary

export function invalidateAssistantSettings() {
  cache = null;
}

export async function getAssistantSettings(): Promise<AssistantSettings> {
  const now = Date.now();
  if (cache && now - cache.at < TTL) return cache.data;
  let data: AssistantSettings;
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: Object.values(KEYS) } },
    });
    // A row EXISTS => the DB value is authoritative (even when empty, which
    // means "explicitly turned off"). Only fall back to env when the user has
    // never saved that field (no row yet), so existing .env setups keep working
    // until first configured here.
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const resolve = (k: AssistantKey) => (map.has(KEYS[k]) ? map.get(KEYS[k])! : envFor(k));
    data = {
      openaiApiKey: resolve("openaiApiKey"),
      geminiApiKey: resolve("geminiApiKey"),
      ollamaUrl: resolve("ollamaUrl"),
      ollamaModel: resolve("ollamaModel"),
    };
  } catch {
    // DB unavailable — fall back entirely to env so nothing breaks.
    data = {
      openaiApiKey: envFor("openaiApiKey"),
      geminiApiKey: envFor("geminiApiKey"),
      ollamaUrl: envFor("ollamaUrl"),
      ollamaModel: envFor("ollamaModel"),
    };
  }
  cache = { at: now, data };
  return data;
}

// Fixed reply used by the chat when NO assistant provider is configured.
export const NO_MODELS_MESSAGE =
  "No models configured. Please configure a model via Settings for use with your ACUMEN Assistant.";

