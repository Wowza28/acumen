import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CHAT_MODEL, SMART_MODEL, SYSTEM_PROMPT, LOCAL_MODEL_CAVEAT, chatWithFallback, generateChatTitle, isAvailableProvider, availableModels, type ProviderId } from "@/lib/openai";
import { NO_MODELS_MESSAGE } from "@/lib/assistantSettings";
import { TOOLS } from "@/lib/tools";
import { toolCreateContact, toolSearchContacts, toolUpdateContact, toolDeleteContact, toolCreateProject, toolSearchProjects, toolUpdateProject, toolAddNote, toolUpdateNote, toolLinkDoc, toolLinkEvent, toolSummarizeFile } from "@/lib/crm";
import { toolCreateTask, toolUpdateTask, toolCompleteTask, toolGetNote, toolGetTask, toolListItems, toolAskKb, toolDraftEmail, toolCreateEvent, toolUpdateEvent } from "@/lib/agent2";

async function runTool(name: string, args: any, historyText?: string): Promise<string> {
  if (name === "create_contact") return toolCreateContact(args);
  if (name === "search_contacts") return toolSearchContacts(args);
  if (name === "update_contact") return toolUpdateContact(args);
  if (name === "delete_contact") return toolDeleteContact(args);
  if (name === "create_project") return toolCreateProject(args);
  if (name === "search_projects") return toolSearchProjects(args);
  if (name === "update_project") return toolUpdateProject(args);
  if (name === "add_note") return toolAddNote(args);
  if (name === "update_note") return toolUpdateNote(args);
  if (name === "link_document") return toolLinkDoc(args);
  if (name === "link_event") return toolLinkEvent(args);
  if (name === "summarize_file") return toolSummarizeFile(args);
  if (name === "create_task") return toolCreateTask(args);
  if (name === "update_task") {
    return toolUpdateTask({ ...args, _history: historyText || "" });
  }
  if (name === "complete_task") return toolCompleteTask(args);
  if (name === "get_note") return toolGetNote(args);
  if (name === "get_task") return toolGetTask(args);
  if (name === "list_items") return toolListItems(args);
  if (name === "ask_kb") return toolAskKb(args);
  if (name === "draft_email") return toolDraftEmail(args);
  if (name === "create_event") return toolCreateEvent(args);
  if (name === "update_event") return toolUpdateEvent(args);
  return "Unknown tool " + name;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, chatId, provider } = await req.json();
    const history = (messages || []).slice(-20);
    const last = history[history.length - 1]?.content || "";
    // resolve or create persistent chat thread
    let chat = chatId ? await prisma.chat.findUnique({ where: { id: chatId } }) : null;
    let isNewThread = false;
    if (!chat) {
      chat = await prisma.chat.create({ data: { title: "New chat" } });
      isNewThread = true;
    }
    await prisma.chatMessage.create({ data: { role: "user", content: last, chatId: chat.id } });

    // No assistant provider configured → reply with a fixed message (still
    // persisted so the thread stays coherent) instead of calling a model.
    const models = await availableModels();
    if (!models.length) {
      await prisma.chatMessage.create({ data: { role: "assistant", content: NO_MODELS_MESSAGE, chatId: chat.id } });
      await prisma.chat.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });
      return NextResponse.json({ reply: NO_MODELS_MESSAGE, actions: [], chatId: chat.id });
    }

    // provider = "openai" | "gemini" | "ollama"; fall back if unavailable in settings/env
    const prov: ProviderId = (await isAvailableProvider(provider)) ? provider : "openai";
    const nowStr = new Date().toString() + " | ISO: " + new Date().toISOString();
    const sys = SYSTEM_PROMPT.replaceAll("{{NOW}}", nowStr) + (prov !== "openai" ? LOCAL_MODEL_CAVEAT : "");
    // single-write guard: track write tools already executed this turn
    const writesDone = new Set<string>();
    let { completion } = await chatWithFallback(
      [{ role: "system", content: sys }, ...history],
      TOOLS,
      CHAT_MODEL,
      prov
    );
    let msg: any = completion.choices[0].message;
    let rounds = 0;
    const toolLog: string[] = [];
    while (msg.tool_calls?.length && rounds < 6) {
      rounds++;
      const followUp: any[] = [{ role: "system", content: sys }, ...history, msg];
      let usedKb = false;
      for (const tc of msg.tool_calls) {
        const args = JSON.parse(tc.function.arguments || "{}");
        if (tc.function.name === "ask_kb") usedKb = true;
        const isWrite = ["create_contact", "update_contact", "delete_contact", "create_project", "update_project", "add_note", "update_note", "draft_email", "create_task", "update_task", "complete_task", "link_document", "link_event", "summarize_file", "create_event", "update_event"].includes(tc.function.name);
        if (isWrite) {
          if (writesDone.has(tc.function.name)) {
            const skip = `Skipped duplicate ${tc.function.name} call (already done this turn).`;
            toolLog.push(skip);
            followUp.push({ role: "tool", tool_call_id: tc.id, content: skip });
            continue;
          }
          writesDone.add(tc.function.name);
        }
        const out = await runTool(tc.function.name, args, history.map((m: any) => m.role === "user" ? m.content : "").join("\n").slice(-3000));
        toolLog.push(out);
        followUp.push({ role: "tool", tool_call_id: tc.id, content: out });
      }
      ({ completion } = await chatWithFallback(
        followUp, TOOLS, usedKb ? SMART_MODEL : CHAT_MODEL, prov
      ));
      msg = completion.choices[0].message;
    }
    const reply = msg.content || toolLog.join("\n") || "Done.";
    await prisma.chatMessage.create({ data: { role: "assistant", content: reply, chatId: chat.id } });
    if (isNewThread) {
      // AI-generated title (fire and forget — don't block the reply)
      generateChatTitle(last, reply).then((t) =>
        prisma.chat.update({ where: { id: chat.id }, data: { title: t, updatedAt: new Date() } }).catch(() => {})
      );
    } else {
      await prisma.chat.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });
    }
    return NextResponse.json({ reply, actions: toolLog, chatId: chat.id });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "chat failed" }, { status: 500 });
  }
}
