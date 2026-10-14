import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chunkText, embedTexts } from "@/lib/rag";
import fs from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const contact_name = (form.get("contact_name") as string) || undefined;
    const project_title = (form.get("project_title") as string) || undefined;
    if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });

    const uploadDir = process.env.UPLOAD_DIR || "./uploads";
    await fs.mkdir(uploadDir, { recursive: true });
    const safe = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const full = path.join(uploadDir, safe);
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(full, bytes);

    // extract text
    let text = "";
    const mime = file.type || "";
    if (mime.includes("pdf") || file.name.endsWith(".pdf")) {
      const pdfParse: any = (await import("pdf-parse")).default;
      const data = await pdfParse(await fs.readFile(full));
      text = data.text || "";
    } else if (file.name.endsWith(".docx") || mime.includes("word")) {
      const mammoth = await import("mammoth");
      const r = await mammoth.extractRawText({ path: full });
      text = r.value || "";
    } else if (mime.startsWith("text/") || file.name.match(/\.(txt|md|csv|json)$/)) {
      text = await fs.readFile(full, "utf8");
    } else {
      text = `[binary ${file.name} ${mime} - no text extracted]`;
    }

    // link (fuzzy, no creation)
    let contactId: string | undefined, projectId: string | undefined;
    if (contact_name) {
      const { resolveContact } = await import("@/lib/crm");
      const r = await resolveContact(contact_name);
      if (r.contact) contactId = r.contact.id;
    }
    if (project_title) {
      const { findProject } = await import("@/lib/crm");
      const p = await findProject(project_title);
      if (p) projectId = p.id;
    }

    const doc = await prisma.document.create({
      data: { filename: file.name, mime, size: bytes.length, path: full, text: text.slice(0, 200000), contactId, projectId }
    });

    // Index for search immediately (cheap, local). NO summary at upload time —
    // summarization/Q&A happens on demand via ask_kb/get tools when the user asks.
    if (text.trim().length > 20) {
      try {
        const chunks = chunkText(text, 500, 80).slice(0, 60);
        const embs = await embedTexts(chunks);
        for (let i = 0; i < chunks.length; i++) {
          await prisma.docChunk.create({ data: { documentId: doc.id, ord: i, text: chunks[i], embedding: JSON.stringify(embs[i]) } });
        }
      } catch (e) {
        console.error("embed failed (non-fatal):", (e as any)?.message?.slice?.(0, 200));
      }
    }

    // suggest links if not provided
    let suggestion = "";
    if (!contactId || !projectId) {
      const contacts = await prisma.contact.findMany({ take: 50 });
      const projects = await prisma.project.findMany({ take: 50 });
      const hitC = contacts.find((c) => text.toLowerCase().includes(c.name.toLowerCase()));
      const hitP = projects.find((p) => text.toLowerCase().includes(p.title.toLowerCase()));
      if (hitC || hitP) suggestion = `Suggested link: ${hitC?.name || "-"} / ${hitP?.title || "-"}. Confirm via chat: "link ${file.name} to ..."`;
    }

    return NextResponse.json({ id: doc.id, filename: doc.filename, suggestion });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  const docs = await prisma.document.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { contact: true, project: true } });
  return NextResponse.json(docs);
}
