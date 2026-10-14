import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAssistantSettings, invalidateAssistantSettings } from "@/lib/assistantSettings";

const ALLOWED = ["openaiApiKey", "geminiApiKey", "ollamaUrl", "ollamaModel"] as const;
type Field = (typeof ALLOWED)[number];

// Never return the real secret values to the client — send a masked form so
// the UI can show "configured" without leaking keys.
function mask(v: string): string {
  if (!v) return "";
  if (v.length <= 8) return "•".repeat(v.length);
  return v.slice(0, 4) + "•".repeat(Math.min(12, v.length - 8)) + v.slice(-4);
}

// GET /api/settings/assistant — current assistant config (secrets masked).
export async function GET() {
  try {
    const s = await getAssistantSettings();
    return NextResponse.json({
      openaiApiKey: mask(s.openaiApiKey),
      geminiApiKey: mask(s.geminiApiKey),
      ollamaUrl: s.ollamaUrl,
      ollamaModel: s.ollamaModel,
      configured: {
        openaiApiKey: !!s.openaiApiKey,
        geminiApiKey: !!s.geminiApiKey,
        ollamaUrl: !!s.ollamaUrl,
        ollamaModel: !!s.ollamaModel,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load assistant settings." }, { status: 500 });
  }
}

// PUT /api/settings/assistant — update one or more fields. Empty string clears
// the override (reverts to env). Saving invalidates the cache so changes apply
// instantly without a restart.
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const updates: Array<{ key: string; value: string }> = [];
    for (const field of ALLOWED) {
      if (field in body && typeof body[field] === "string") {
        const value = body[field].trim();
        if (value.length > 500) {
          return NextResponse.json({ error: `"${field}" is too long.` }, { status: 400 });
        }
        updates.push({ key: field, value });
      }
    }
    if (!updates.length) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    for (const u of updates) {
      // Always upsert (even empty string). An empty row means "explicitly
      // off" and overrides env; a missing row would fall back to env, which
      // is NOT what clearing should do.
      await prisma.appSetting.upsert({
        where: { key: u.key },
        create: { key: u.key, value: u.value },
        update: { value: u.value },
      });
    }
    invalidateAssistantSettings();
    const s = await getAssistantSettings();
    return NextResponse.json({
      ok: true,
      openaiApiKey: mask(s.openaiApiKey),
      geminiApiKey: mask(s.geminiApiKey),
      ollamaUrl: s.ollamaUrl,
      ollamaModel: s.ollamaModel,
      configured: {
        openaiApiKey: !!s.openaiApiKey,
        geminiApiKey: !!s.geminiApiKey,
        ollamaUrl: !!s.ollamaUrl,
        ollamaModel: !!s.ollamaModel,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not save assistant settings." }, { status: 500 });
  }
}
