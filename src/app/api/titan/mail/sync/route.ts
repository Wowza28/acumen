import { NextResponse } from "next/server";
import { listTitanMailRefs, fetchTitanMailByUids } from "@/lib/titan";
import { prisma } from "@/lib/db";

// GET /api/titan/mail/sync — pull IMAP messages into SyncedEmail (read-only).
// Walks the inbox newest->oldest in batches: probes envelopes (cheap) to find
// UIDs we don't have yet, then downloads+stores ONLY the new messages. Each
// sync walks TITAN_SYNC_MAX_BATCHES batches so history keeps growing over time.
export async function GET() {
  try {
    const batch = Number(process.env.TITAN_MAIL_LIMIT || 100);
    const maxBatches = Number(process.env.TITAN_SYNC_MAX_BATCHES || 3);
    let synced = 0, linked = 0, probed = 0, batches = 0;
    for (let b = 0; b < maxBatches; b++) {
      const refs = await listTitanMailRefs(batch, b * batch);
      if (!refs.length) break;
      probed += refs.length;
      batches++;
      // Which of these keys do we already have? (one batched query)
      const keys = refs.map((r) => r.messageId);
      const known = await prisma.syncedEmail.findMany({
        where: { gmailId: { in: keys } }, select: { gmailId: true }
      });
      const knownSet = new Set(known.map((k) => k.gmailId));
      const newRefs = refs.filter((r) => !knownSet.has(r.messageId));
      // Download + parse only the new messages
      const mails = await fetchTitanMailByUids(newRefs.map((r) => r.uid));
      for (const m of mails) {
        let contactId: string | undefined;
        const emailMatch = (m.from || "").match(/[\w.+-]+@[\w-]+\.[\w.]+/);
        if (emailMatch) {
          // match default email OR any secondary email row
          const c = await prisma.contact.findFirst({
            where: { OR: [{ email: emailMatch[0] }, { contactEmails: { some: { value: emailMatch[0] } } }] }
          });
          if (c) { contactId = c.id; linked++; }
        }
        await prisma.syncedEmail.upsert({
          where: { gmailId: m.messageId || `titan-${m.uid}` },
          update: {},
          create: {
            gmailId: m.messageId || `titan-${m.uid}`, threadId: m.threadId, from: m.from, to: m.to,
            subject: m.subject, snippet: m.snippet, body: m.body,
            date: m.date, contactId
          }
        });
        synced++;
      }
      // Short batch = beginning of the mailbox — no point probing further back.
      if (refs.length < batch) break;
    }
    return NextResponse.json({ probed, synced, autoLinked: linked, batches });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
