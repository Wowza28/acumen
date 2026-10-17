import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";

// POST /api/voice/transcribe (multipart `audio`) -> { text }. Mic audio is
// transcribed with OpenAI whisper-1; used by the chat VoiceButton.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("audio") as File | null;
    if (!file) return NextResponse.json({ error: "no audio file (field: audio)" }, { status: 400 });
    const openai = await getOpenAI();
    const buf = Buffer.from(await file.arrayBuffer());
    const f: any = new File([buf], file.name || "audio.webm", { type: file.type || "audio/webm" });
    const tr = await openai.audio.transcriptions.create({ file: f, model: "whisper-1" });
    return NextResponse.json({ text: tr.text });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
