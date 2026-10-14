// The "[Attached files: ...]" suffix is appended to the user's message so the
// AI has context about uploads — it IS part of the prompt sent to /api/chat,
// but it should never be shown in the chat UI (we display attachment chips
// instead). Shared by the send path and ChatPanel's display stripping.
export const ATTACH_RE =
  /\[Attached files: (.*?)(?:\. They are uploaded and summarized|\. Uploaded); use link_document or ask_kb if the user refers to them\.\]/;

export function makeAttachSuffix(names: string[]): string {
  if (!names.length) return "";
  return `\n\n[Attached files: ${names.join(", ")}. Uploaded; use link_document or ask_kb if the user refers to them.]`;
}

export function splitAttachments(content: string): { text: string; files: string[] } {
  const m = content.match(ATTACH_RE);
  if (!m) return { text: content, files: [] };
  return {
    text: content.replace(ATTACH_RE, "").replace(/\n+$/, ""),
    files: m[1].split(", ").filter(Boolean)
  };
}
