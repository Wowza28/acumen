import { NextResponse } from "next/server";
import { availableModels } from "@/lib/openai";

// GET /api/models — chat-model options for the composer dropdown.
// OpenAI is always present; Gemini/Ollama appear when configured in Settings/.env.
export async function GET() {
  return NextResponse.json({ models: await availableModels() });
}
