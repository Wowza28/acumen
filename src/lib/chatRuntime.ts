export type ChatMsg = { role: string; content: string };

/**
 * Cross-navigation runtime for the main chat (app/page.tsx).
 *
 * The server (/api/chat) always runs the model and its tool calls to
 * completion no matter what the client does — so object creation/edit requests
 * are never "lost" server-side. What can get lost is the RESULT: if the user
 * switches chats/routes while a send is in flight, the reply used to paint
 * over the wrong thread (or be overwritten by loadChat) and look like the
 * chat "died".
 *
 * This module lives at module scope so it survives component unmounts:
 *  - `pending`   — in-flight send promises keyed by chat id (or a provisional
 *                  key for brand-new threads), so returning to that chat can
 *                  await the reply instead of showing an unanswered prompt.
 *  - `snapshots` — last-known messages per chat for instant paint on return.
 */
export const chatRuntime = {
  snapshots: new Map<string, ChatMsg[]>(),
  pending: new Map<string, Promise<ChatMsg[]>>(),
};
