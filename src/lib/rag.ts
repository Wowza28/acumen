import { getOpenAI, EMBED_MODEL } from "./openai";

export function chunkText(text: string, size = 800, overlap = 120): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + size).join(" "));
    i += size - overlap;
  }
  return chunks.filter((c) => c.trim().length > 20);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const openai = await getOpenAI();
  const res = await openai.embeddings.create({ model: EMBED_MODEL, input: texts });
  return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
