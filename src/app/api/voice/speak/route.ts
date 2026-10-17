import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";

// POST /api/voice/speak { text, voice? } -> audio/mpeg (OpenAI tts-1, ≤4000 chars).
export async function POST(req: NextRequest) {
  try {
    const { text, voice } = await req.json();
    if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
    const openai = await getOpenAI();
    const speech = await openai.audio.speech.create({
      model: "tts-1",
      voice: (voice || "alloy") as any,
      input: text.slice(0, 4000)
    });
    const buf = Buffer.from(await speech.arrayBuffer());
    return new NextResponse(buf, { headers: { "Content-Type": "audio/mpeg" } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
