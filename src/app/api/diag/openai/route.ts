import { NextResponse } from "next/server";
import { getOpenAI, CHAT_MODEL, SMART_MODEL, EMBED_MODEL, modelChain } from "@/lib/openai";

// GET /api/diag/openai — tests each model with + without tools to find the 403 culprit.
// Never returns the API key.
export async function GET() {
  const results: Record<string, any> = {};
  const openai = await getOpenAI();
  async function probe(model: string, withTools: boolean) {
    try {
      const body: any = {
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5
      };
      if (withTools) {
        body.tools = [
          { type: "function", function: { name: "probe_tool", description: "probe", parameters: { type: "object", properties: {} } } }
        ];
      }
      await openai.chat.completions.create(body);
      return "OK";
    } catch (e: any) {
      return `FAIL ${e?.status || ""} ${(e?.message || "").slice(0, 200)}`;
    }
  }
  for (const m of modelChain(CHAT_MODEL)) {
    results[m + " (plain)"] = await probe(m, false);
    results[m + " (tools)"] = await probe(m, true);
  }
  try {
    await openai.embeddings.create({ model: EMBED_MODEL, input: "ping" });
    results[EMBED_MODEL + " (embed)"] = "OK";
  } catch (e: any) {
    results[EMBED_MODEL + " (embed)"] = `FAIL ${e?.status || ""} ${(e?.message || "").slice(0, 200)}`;
  }
  return NextResponse.json({ CHAT_MODEL, SMART_MODEL, EMBED_MODEL, results });
}
