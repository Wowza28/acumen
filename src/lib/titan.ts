import fs from "fs/promises";
import path from "path";
import { prisma } from "./db";
import { getTitanAccount } from "./titanAccount";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import ical from "node-ical";

/** Lightweight IMAP login probe to validate credentials before saving. */
export async function probeTitanLogin(user: string, pass: string): Promise<{ ok: boolean; error?: string }> {
  const host = process.env.TITAN_IMAP_HOST || "imap.titan.email";
  try {
    const client = new ImapFlow({
      host, port: 993, secure: true,
      auth: { user, pass },
      logger: false,
      tls: { rejectUnauthorized: true }
    });
    await client.connect();
    await client.logout();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Login failed." };
  }
}

// ---------- Titan Mail (IMAP, read-only) ----------
// Servers: imap.titan.email:993 (SSL). Credentials resolve from the account
// configured in Settings → Accounts (DB), falling back to .env.

async function creds() {
  const acct = await getTitanAccount();
  if (!acct) {
    throw new Error("No Titan account configured. Add one in Settings → Accounts.");
  }
  return { user: acct.email, pass: acct.password };
}

export type TitanMail = {
  uid: number;
  messageId: string;
  threadId?: string;
  from?: string;
  to?: string;
  subject?: string;
  snippet?: string;
  body?: string;
  date: Date;
};

function addr(a?: { address?: string; name?: string } | null): string | undefined {
  if (!a?.address) return undefined;
  return a.name ? `${a.name} <${a.address}>` : a.address;
}

export type TitanMailRef = { uid: number; messageId: string };

/** Light probe: envelope-only listing of a message range (no bodies downloaded).
 *  Used by the sync route to cheaply detect which UIDs are new. */
export async function listTitanMailRefs(limit = 100, offset = 0): Promise<TitanMailRef[]> {
  const { user, pass } = await creds();
  const host = process.env.TITAN_IMAP_HOST || "imap.titan.email";
  const client = new ImapFlow({
    host, port: 993, secure: true,
    auth: { user, pass },
    logger: false,
    tls: { rejectUnauthorized: true }
  });
  const out: TitanMailRef[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mb = client.mailbox;
      const exists = mb ? mb.exists : 0;
      const end = exists - offset;
      if (end <= 0) return out;
      const start = Math.max(1, end - limit + 1);
      for await (const msg of client.fetch(`${start}:${end}`, { envelope: true, uid: true })) {
        out.push({ uid: msg.uid, messageId: msg.envelope?.messageId || `titan-${msg.uid}` });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
  return out;
}

/** Download + parse specific messages by UID (read-only). */
export async function fetchTitanMailByUids(uids: number[]): Promise<TitanMail[]> {
  if (!uids.length) return [];
  const { user, pass } = await creds();
  const host = process.env.TITAN_IMAP_HOST || "imap.titan.email";
  const client = new ImapFlow({
    host, port: 993, secure: true,
    auth: { user, pass },
    logger: false,
    tls: { rejectUnauthorized: true }
  });
  const out: TitanMail[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const range = uids.map(String).join(",");
      for await (const msg of client.fetch(range, { source: true, envelope: true, internalDate: true, uid: true }, { uid: true })) {
        try {
          const parsed = await simpleParser(msg.source as Buffer);
          const text = (parsed.text || "").replace(/\s+/g, " ").trim();
          out.push({
            uid: msg.uid,
            messageId: parsed.messageId || `titan-${msg.uid}`,
            threadId: parsed.inReplyTo || undefined,
            from: addr(parsed.from?.value?.[0]) || parsed.from?.text,
            to: (parsed.to as any)?.value?.map((v: any) => addr(v)).filter(Boolean).join(", ") || (parsed.to as any)?.text,
            subject: parsed.subject,
            snippet: (text || parsed.subject || "").slice(0, 500),
            body: text.slice(0, 8000),
            date: new Date((parsed.date as any) || msg.internalDate || Date.now())
          });
        } catch { /* skip unparseable message */ }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
  return out;
}

/** Compose an email and save it to the Titan Drafts folder via IMAP APPEND.
 *  Read/write-safe: creates a draft the user reviews and sends themselves. */
export async function draftTitanEmail(opts: {
  to: string;
  subject: string;
  body: string;
  attachments?: Array<{ name: string; mime?: string }>;
  from?: string;
}): Promise<{ folder: string }> {
  const { user, pass } = await creds();
  const host = process.env.TITAN_IMAP_HOST || "imap.titan.email";
  const client = new ImapFlow({
    host, port: 993, secure: true,
    auth: { user, pass },
    logger: false,
    tls: { rejectUnauthorized: true }
  });
  await client.connect();
  try {
    const boxes = await client.list();
    const drafts =
      boxes.find((b) => /draft/i.test(b.path))?.path ||
      boxes.find((b) => /draft/i.test(b.name))?.path ||
      "Drafts";
    const from = opts.from || user;
    const domain = (user.split("@")[1] || "localhost");
    const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${domain}>`;
    const outer = `outer${Date.now().toString(36)}`;
    const inner = `inner${Date.now().toString(36)}`;
    const headerLines = [
      `From: ${from}`,
      `To: ${opts.to}`,
      `Subject: ${encodeHeader(opts.subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: ${messageId}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${outer}"`,
    ];
    const bodyHtml = fontWrap(toHtmlBody(opts.body || ""));
    const bodyText = toPlainBody(opts.body || "");
    const resolvedAttachments = await resolveAttachmentFiles(
      (opts.attachments || []).map((a: { name: string }) => a.name),
      undefined
    );
    const bodyLines = [
      ...headerLines,
      "",
      ...(await buildMimeParts(outer, inner, bodyText, bodyHtml, resolvedAttachments)),
      `--${outer}--`,
    ];
    await client.append(drafts, bodyLines.join("\r\n"), ["\\Draft"]);
    return { folder: drafts };
  } finally {
    await client.logout();
  }
}
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}
function toHtmlBody(s: string): string {
  const t = (s || "").trim();
  if (!t) return "";
  // If the AI already composed HTML, trust its structure — but strip any text
  // colors it set so Titan/the recipient client owns color (dark-mode safe),
  // and make sure the Titan-like font is applied.
  if (/<[a-z][^>]*>/i.test(t)) {
    let h = t.replace(/\scolor\s*:\s*[^;}"']+/gi, "");
    if (!/font-family/i.test(h)) h = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">${h}</div>`;
    return h;
  }
  return escapeHtml(t)
    .split(/\r?\n\s*\r?\n/)
    .map((p) => (p.trim() ? `<p style="margin:0 0 10px;">${p.replace(/\r?\n/g, "<br>")}</p>` : ""))
    .filter(Boolean)
    .join("\n");
}
/** Plain-text alternative: strip tags, decode common entities, collapse whitespace. */
function toPlainBody(s: string): string {
  const t = (s || "").trim();
  let out = t;
  if (/<[a-z][^>]*>/i.test(t)) {
    out = t
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
  }
  out = out.replace(/\r/g, "").replace(/[ \t]*\n(\s*\n)+/g, "\n\n").trim();
  return out || " ";
}
/** Wrap the HTML body so Titan renders it in a sans-serif font like a fresh
 *  Titan compose window (unstyled HTML otherwise falls back to monospace).
 *  No text color is set — Titan/the recipient's client owns color (dark mode). */
function fontWrap(bodyInner: string): string {
  const inner = bodyInner || "<p>&nbsp;</p>";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">${inner}</div>`;
}
/** Strip CR/LF so user/AI text can never inject extra headers. */
function cleanHeader(s: string): string {
  return String(s || "").replace(/[\r\n]+/g, " ").trim();
}
/** RFC 2047-encode non-ASCII subjects (e.g. em-dashes) so they survive IMAP. */
function encodeHeader(s: string): string {
  const clean = cleanHeader(s);
  if (!clean) return "";
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}
async function buildMimeParts(
  outer: string,
  inner: string,
  text: string,
  html: string,
  attachments: Array<{ name: string; mime?: string; path: string }>
): Promise<string[]> {
  const parts: string[] = [
    `--${outer}`,
    `Content-Type: multipart/alternative; boundary="${inner}"`,
    "",
    `--${inner}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    "",
    text || " ",
    `--${inner}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    "",
    html || "<p>&nbsp;</p>",
    `--${inner}--`,
  ];
  if (attachments && attachments.length) {
    for (const a of attachments) {
      const bytes = await fs.readFile(a.path);
      const b64 = bytes.toString("base64");
      const fname = safeFilename(a.name);
      parts.push(
        `--${outer}`,
        `Content-Type: ${a.mime || "application/octet-stream"}; name="${fname}"`,
        `Content-Transfer-Encoding: base64`,
        `Content-Disposition: attachment; filename="${fname}"`,
        "",
        foldText(b64, 76)
      );
    }
  }
  return parts;
}
export type ResolvedAttachment = { query: string; name: string; mime: string; path: string };

/** Split a filename/query into searchable tokens: lowercase, extension stripped,
 *  separators collapsed. e.g. "NVCPitchDeckTemplate.pdf" -> ["nvcpitchdecktemplate"],
 *  "NVC Pitch Deck" -> ["nvc","pitch","deck"]. */
function attachTokens(s: string): string[] {
  const noExt = String(s || "").replace(/\.[a-z0-9]{1,5}$/i, " ");
  return noExt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !["the", "a", "an", "file", "document"].includes(w));
}
function compactLower(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function stripStoredPrefix(f: string): string {
  // uploads are stored as "<timestamp>-<original>" — match against the original
  const m = f.match(/^\d+-(.+)$/);
  return m ? m[1] : f;
}
/** Score how well a CRM filename matches a user query (0-100). Exact id or
 *  filename wins; otherwise compact-substring and token overlap cover rough
 *  names like "NVC Pitch Deck" -> "NVCPitchDeckTemplate.pdf". */
function scoreAttachMatch(query: string, docId: string, filename: string): number {
  const q = query.trim();
  if (!q) return 0;
  if (q === docId) return 100;
  const ql = q.toLowerCase();
  const fl = filename.toLowerCase();
  if (ql === fl) return 90;
  const qCompact = compactLower(q);
  const fCompact = compactLower(filename);
  if (qCompact && (fCompact === qCompact || fCompact.startsWith(qCompact))) return 80;
  if (qCompact.length >= 3 && fCompact.includes(qCompact)) return 70;
  if (fCompact.length >= 3 && qCompact.includes(fCompact.replace(/(pdf|docx?|txt|csv)$/, ""))) return 60;
  const qToks = attachTokens(q);
  const fToks = attachTokens(filename);
  const fJoined = fToks.join(" ");
  if (!qToks.length) return 0;
  let hit = 0;
  for (const tok of qToks) {
    if (fJoined.includes(tok) || fCompact.includes(tok)) hit++;
    else if (tok.length >= 4 && fToks.some((f) => f.includes(tok.slice(0, 4)))) hit += 0.5;
  }
  const frac = hit / qToks.length;
  if (frac >= 1) return 65;
  if (frac >= 0.5) return 45;
  return 0;
}
function guessMime(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = m ? m[1] : "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "txt" || ext === "md" || ext === "csv") return "text/plain";
  return "application/octet-stream";
}
export async function resolveAttachmentFiles(
  names: string[],
  uploadDir?: string
): Promise<ResolvedAttachment[]> {
  const dir = uploadDir || process.env.UPLOAD_DIR || "./uploads";
  const { resolveStoredPath } = await import("./filePaths");
  const out: ResolvedAttachment[] = [];
  const seen = new Set<string>();
  if (!names.length) return out;
  let docs: Array<{ id: string; filename: string; mime: string; path: string }> = [];
  try {
    docs = await prisma.document.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, filename: true, mime: true, path: true },
    });
  } catch (e) {
    console.error("[attach] prisma document lookup failed:", (e as Error)?.message);
  }
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch (e) {
    console.error("[attach] cannot read upload dir:", (e as Error)?.message);
  }
  for (const raw of names) {
    const q = String(raw || "").trim();
    if (!q || out.some((o) => o.query.toLowerCase() === q.toLowerCase())) continue;
    let best: { score: number; name: string; mime: string; path: string } | null = null;
    for (const d of docs) {
      const s = scoreAttachMatch(q, d.id, d.filename);
      if (!best || s > best.score) best = { score: s, name: d.filename, mime: d.mime || "application/octet-stream", path: resolveStoredPath(d.path) };
    }
    if (best && best.score >= 45) {
      const key = best.path.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ query: q, name: best.name, mime: best.mime, path: best.path });
        continue;
      }
    }
    // Fallback: upload-dir files (match against timestamp-stripped original name)
    let bestFile: { score: number; stored: string } | null = null;
    for (const f of files) {
      const original = stripStoredPrefix(f);
      const s = Math.max(scoreAttachMatch(q, "", original), scoreAttachMatch(q, "", f));
      if (!bestFile || s > bestFile.score) bestFile = { score: s, stored: f };
    }
    if (bestFile && bestFile.score >= 45) {
      const key = path.join(dir, bestFile.stored).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        const original = stripStoredPrefix(bestFile.stored);
        out.push({ query: q, name: original, mime: guessMime(original), path: path.join(dir, bestFile.stored) });
      }
    }
  }
  return out;
}
function safeFilename(name: string): string {
  return name.replace(/[\\"]/g, "_");
}
function foldText(s: string, width = 76): string {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += width) out.push(s.slice(i, i + width));
  return out.join("\r\n");
}

async function basic(): Promise<string> {
  const { user, pass } = await creds();
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}


  async function dav(url: string, method: string, body?: string, depth = "0", contentType?: string): Promise<{ status: number; text: string }> {
  const r = await fetch(url, {
    method,
    headers: {
      "Authorization": await basic(),
      "Depth": depth,
      ...(body ? { "Content-Type": contentType || "application/xml; charset=utf-8" } : {})
    },
    body,
    signal: AbortSignal.timeout(20000)
  });
  const text = await r.text();
  if (r.status === 401) {
    throw new Error("Titan CalDAV auth failed (401). Check TITAN_EMAIL/TITAN_PASSWORD in .env.");
  }
  return { status: r.status, text };
}

/** First <tag>…</tag> content ignoring namespace prefixes. */
function tagText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<((?:[A-Za-z0-9_]+:)?${tag})[^>]*>([\\s\\S]*?)</\\1>`, "i"));
  return m ? m[2].trim() : null;
}

function icsDate(v: string): Date | undefined {
  if (!v) return undefined;
  const m = v.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) { const d = new Date(v); return isNaN(+d) ? undefined : d; }
  const [, Y, Mo, D, H = "00", Mi = "00", S = "00", z] = m;
  const d = new Date(`${Y}-${Mo}-${D}T${H}:${Mi}:${S}${z ? "Z" : ""}`);
  return isNaN(+d) ? undefined : d;
}

/** All <href> values nested inside a given element (e.g. calendar-home-set). */
function hrefsIn(xml: string, tag: string): string[] {
  const m = xml.match(new RegExp(`<((?:[A-Za-z0-9_]+:)?${tag})[^>]*>([\\s\\S]*?)</\\1>`, "i"));
  if (!m) return [];
  const re = /<((?:[A-Za-z0-9_]+:)?href)[^>]*>([^<]*)<\/\1>/gi;
  const out: string[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(m[2])) !== null) out.push(mm[2].trim());
  return out;
}

/** Discover ALL real calendar collection URLs for the configured user.
 *  Fixes two bugs in the old version: (1) it grabbed the principal's OWN href
 *  instead of the one inside <calendar-home-set>; (2) it returned the home
 *  bundle rather than the actual <calendar/> collection. */
export async function discoverCalendars(): Promise<string[]> {
  const direct = process.env.TITAN_CALDAV_CAL_URL;
  if (direct) return [direct];
  const { user } = await creds();
  const base = (process.env.TITAN_CALDAV_URL || "https://dav.titan.email").replace(/\/$/, "");
  const principal = `${base}/principals/${encodeURIComponent(user)}`;

  const homeReq = await dav(principal, "PROPFIND",
    `<?xml version="1.0" encoding="UTF-8"?>
     <D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
       <D:prop><C:calendar-home-set/></D:prop>
     </D:propfind>`);
  if (homeReq.status >= 400) {
    throw new Error(`CalDAV principal lookup failed (HTTP ${homeReq.status}) at ${principal}. Your plan may not include CalDAV, or TITAN_CALDAV_URL is wrong.`);
  }
  // hrefs INSIDE <calendar-home-set> (not the response's own href)
  const homes = hrefsIn(homeReq.text, "calendar-home-set");
  const homeUrls = homes.length
    ? homes.map((h) => new URL(h, principal).toString())
    : [`${base}/calendars/${encodeURIComponent(user)}/`];

  const cals: string[] = [];
  for (const home of homeUrls) {
    const listReq = await dav(home, "PROPFIND",
      `<?xml version="1.0" encoding="UTF-8"?>
       <D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
         <D:prop><D:resourcetype/><D:displayname/></D:prop>
       </D:propfind>`, "1");
    const responses = listReq.text.split(/<(?:[A-Za-z0-9_]+:)?response[\s>]/i).slice(1);
    for (const resp of responses) {
      const href = tagText(resp, "href");
      if (!href) continue;
      const url = new URL(href, home).toString().replace(/\/$/, "");
      const rt = (resp.match(/<(?:[A-Za-z0-9_]+:)?resourcetype[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?resourcetype>/i) || [])[1] || "";
      const isCalendar = /calendar/i.test(rt);
      const isSelf = url === home.replace(/\/$/, "");
      if (isCalendar && !isSelf && !cals.includes(url)) cals.push(url);
    }
  }
  return cals.length ? cals : homeUrls;
}

/** List child .ics resources of a calendar and GET+parse each into VEVENTs.
 *  Uses PROPFIND+GET instead of calendar-query REPORT because Titan's REPORT
 *  is unreliable (it returns the collection's own metadata, not events). */
export type TitanAttendee = { email: string; name?: string };

export type TitanEvent = {
  uid: string;
  /** direct .ics href (relative) — needed to PUT updates back */
  href?: string;
  summary?: string;
  start?: Date;
  end?: Date;
  allDay?: boolean;
  location?: string;
  description?: string;
  /** video/conference link: URL prop, X-TITAN-MEET, or first URL found in description */
  meetingLink?: string;
  organizer?: string;
  attendees?: TitanAttendee[];
};


async function fetchEventsFromCalendar(calUrl: string): Promise<TitanEvent[]> {
  const pf = await dav(calUrl, "PROPFIND",
    `<?xml version="1.0" encoding="UTF-8"?>
     <D:propfind xmlns:D="DAV:"><D:prop><D:getetag/><D:getcontenttype/></D:prop></D:propfind>`, "1");
  const re = /<((?:[A-Za-z0-9_]+:)?href)[^>]*>([^<]*)<\/\1>/gi;
  const childHrefs: string[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(pf.text)) !== null) {
    const h = mm[2].trim();
    if (/\.ics$/i.test(h)) childHrefs.push(h);
  }
  const out: TitanEvent[] = [];
  for (const href of childHrefs) {
    const icsUrl = new URL(href, calUrl).toString();
    const ics = await dav(icsUrl, "GET");
    if (ics.status >= 400 || !ics.text.includes("BEGIN:VEVENT")) continue;
    try {
      const parsed = ical.parseICS(ics.text);
      for (const ev of Object.values(parsed)) {
        const e = ev as any;
        if (e?.type !== "VEVENT" || !e.uid) continue;
        out.push({
          uid: String(e.uid),
          href,
          summary: e.summary,
          start: e.start instanceof Date ? e.start : icsDate(String(e.start || "")),
          end: e.end instanceof Date ? e.end : icsDate(String(e.end || "")),
          allDay: e.datetype !== "date-time",
          location: e.location || undefined,
          description: e.description || undefined,
          meetingLink:
            (typeof e.url === "string" && e.url) ||
            (typeof e["titan-meet"] === "string" && e["titan-meet"]) ||
            (typeof e["TITAN-MEET"] === "string" && e["TITAN-MEET"]) ||
            firstUrl(e.description) ||
            undefined,
          organizer: attendeeEmail(e.organizer, true),
          attendees: normalizeAttendees(e.attendee ?? e.attendees),
        });
      }
    } catch { /* skip unparseable ics */ }
  }
  return out;
}

/** Parse one node-ical ATTENDEE/ORGANIZER value into display email/name. */
function attendeeEmail(v: any, keepRaw = false): string | undefined {
  if (!v) return undefined;
  const raw = typeof v === "string" ? v : v.val || v.mailto || v.email;
  if (!raw || typeof raw !== "string") return undefined;
  const email = raw.replace(/^mailto:/i, "").trim();
  if (!email) return undefined;
  if (keepRaw) {
    const cn = v?.params?.CN;
    return cn && cn !== email ? `${cn} <${email}>` : email;
  }
  return email;
}

function normalizeAttendees(v: any): TitanAttendee[] | undefined {
  const list = Array.isArray(v) ? v : v ? [v] : [];
  const out: TitanAttendee[] = [];
  for (const a of list) {
    const email = attendeeEmail(a);
    if (!email || out.some((x) => x.email.toLowerCase() === email.toLowerCase())) continue;
    const name = typeof a === "object" ? a?.params?.CN : undefined;
    out.push({ email, ...(name && name !== email ? { name } : {}) });
  }
  return out.length ? out : undefined;
}

/** First http(s) URL inside free text (descriptions often carry the meet link). */
function firstUrl(s: any): string | undefined {
  if (!s || typeof s !== "string") return undefined;
  const m = s.match(/https?:\/\/[^\s<>"')]+/i);
  return m ? m[0].replace(/[.,;!?]+$/, "") : undefined;
}

/** Fetch events overlapping [from, to] across ALL of the user's calendars. */
export async function fetchTitanEvents(from: Date, to: Date): Promise<TitanEvent[]> {
  const cals = await discoverCalendars();
  const byUid = new Map<string, TitanEvent>();
  const out: TitanEvent[] = [];
  for (const calUrl of cals) {
    let evs: TitanEvent[] = [];
    try { evs = await fetchEventsFromCalendar(calUrl); } catch { continue; }
    for (const e of evs) {
      if (!e.start) continue;
      const eEnd = e.end || new Date(e.start.getTime() + 3600000);
      if (eEnd < from || e.start > to) continue; // no overlap with window
      if (!byUid.has(e.uid)) { byUid.set(e.uid, e); out.push(e); }
    }
  }
  return out.sort((a, b) => (a.start! < b.start! ? -1 : 1));
}

/** Build a VCALENDAR string for create/update. Guests become ATTENDEE lines
 *  (resolved via People when only a name is given). */
function buildEventIcs(o: {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  location?: string;
  description?: string;
  meetingLink?: string;
  organizer?: string;
  guests?: Array<{ email: string; name?: string }>;
}): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const icsEsc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const fmtDt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const fmtDay = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Acumen//Events//EN",
    "BEGIN:VEVENT",
    `UID:${o.uid}`,
    `DTSTAMP:${stamp}`,
    o.allDay ? `DTSTART;VALUE=DATE:${fmtDay(o.start)}` : `DTSTART:${fmtDt(o.start)}`,
    o.allDay ? `DTEND;VALUE=DATE:${fmtDay(o.end)}` : `DTEND:${fmtDt(o.end)}`,
    `SUMMARY:${icsEsc(o.summary)}`,
  ];
  if (o.location) lines.push(`LOCATION:${icsEsc(o.location)}`);
  let desc = o.description || "";
  if (o.meetingLink && !desc.includes(o.meetingLink)) desc = (desc ? desc + "\n\n" : "") + `Join: ${o.meetingLink}`;
  if (desc) lines.push(`DESCRIPTION:${icsEsc(desc)}`);
  if (o.meetingLink) lines.push(`URL:${o.meetingLink}`);
  if (o.organizer) lines.push(`ORGANIZER:mailto:${o.organizer}`);
  for (const g of o.guests || []) {
    const cn = g.name && g.name !== g.email ? `;CN=${icsEsc(g.name)}` : "";
    lines.push(`ATTENDEE${cn}:mailto:${g.email}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

/** Resolve guest strings to {email,name}: direct emails pass through,
 *  names are looked up in People (skipped with a warning if unknown). */
async function resolveGuests(guests: string[]): Promise<{ resolved: Array<{ email: string; name?: string }>; unknown: string[] }> {
  const resolved: Array<{ email: string; name?: string }> = [];
  const unknown: string[] = [];
  const { resolveContact } = await import("./crm");
  for (const g of guests || []) {
    const s = String(g || "").trim();
    if (!s) continue;
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) {
      if (!resolved.some((r) => r.email.toLowerCase() === s.toLowerCase())) resolved.push({ email: s });
      continue;
    }
    try {
      const r = await resolveContact(s);
      if (r.contact?.email) {
        const cEmail: string = r.contact.email;
        if (!resolved.some((x) => x.email.toLowerCase() === cEmail.toLowerCase()))
          resolved.push({ email: cEmail, name: r.contact.name });
      } else unknown.push(s);
    } catch { unknown.push(s); }
  }
  return { resolved, unknown };
}

export type TitanEventInput = {
  summary: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  location?: string;
  description?: string;
  meetingLink?: string;
  guests?: string[];
};

/** Create an event on the primary Titan calendar via CalDAV PUT. */
export async function createTitanEvent(input: TitanEventInput): Promise<{ uid: string }> {
  const cals = await discoverCalendars();
  if (!cals.length) throw new Error("No Titan calendar found for event creation.");
  const calUrl = cals[0].replace(/\/?$/, "/");
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@acumen`;
  const { resolved } = await resolveGuests(input.guests || []);
  const { user } = await creds();
  const ics = buildEventIcs({
    uid,
    summary: input.summary,
    start: input.start,
    end: input.end,
    allDay: input.allDay,
    location: input.location,
    description: input.description,
    meetingLink: input.meetingLink,
    organizer: user,
    guests: resolved,
  });
  const r = await dav(`${calUrl}${uid}.ics`, "PUT", ics, "0", "text/calendar; charset=utf-8");
  if (r.status >= 400) throw new Error(`Titan event create failed (HTTP ${r.status}).`);
  return { uid };
}

/** Update an existing event (matched by UID) via CalDAV PUT. Guests merge with existing attendees unless replaced. */
export async function updateTitanEvent(
  uid: string,
  patch: Partial<Omit<TitanEventInput, "start" | "end">> & { start?: Date; end?: Date; replaceGuests?: boolean }
): Promise<{ uid: string }> {
  const existing = await findTitanEventByUid(uid);
  if (!existing) throw new Error(`No Titan event found matching "${uid}".`);
  const calUrl = existing.calUrl;
  const href = existing.event.href || `${uid}.ics`;
  const icsUrl = new URL(href, calUrl).toString();

  // fetch current ics so untouched fields survive
  let cur: any = null;
  try {
    const got = await dav(icsUrl, "GET");
    if (got.status < 400 && got.text.includes("BEGIN:VEVENT")) {
      const parsed = ical.parseICS(got.text);
      for (const ev of Object.values(parsed)) {
        const e = ev as any;
        if (e?.type === "VEVENT") { cur = e; break; }
      }
    }
  } catch { /* fall back to stored fields */ }

  const mergedGuests = async (): Promise<Array<{ email: string; name?: string }>> => {
    if (patch.guests && patch.replaceGuests) return (await resolveGuests(patch.guests)).resolved;
    const base: Array<{ email: string; name?: string }> = (existing.event.attendees || []).map((a) => ({ email: a.email, name: a.name }));
    if (patch.guests) {
      const { resolved } = await resolveGuests(patch.guests);
      for (const g of resolved) {
        if (!base.some((b) => b.email.toLowerCase() === g.email.toLowerCase())) base.push(g);
      }
    }
    return base;
  };
  const guests = await mergedGuests();
  const start = patch.start || existing.event.start || new Date();
  const end = patch.end || existing.event.end || new Date(start.getTime() + 3600000);
  const descBase = patch.description ?? (typeof cur?.description === "string" ? cur.description : existing.event.description);
  const locBase = patch.location ?? (typeof cur?.location === "string" ? cur.location : existing.event.location);
  const meetBase = patch.meetingLink ?? existing.event.meetingLink;

  const ics = buildEventIcs({
    uid,
    summary: patch.summary ?? (typeof cur?.summary === "string" ? cur.summary : existing.event.summary) ?? "(no title)",
    start,
    end,
    allDay: patch.allDay ?? existing.event.allDay ?? false,
    location: locBase,
    description: typeof descBase === "string" ? descBase : undefined,
    meetingLink: meetBase,
    organizer: (typeof cur?.organizer === "string" && cur.organizer) ? cur.organizer.replace(/^mailto:/i, "") : (await creds()).user,
    guests,
  });
  const r = await dav(icsUrl, "PUT", ics, "0", "text/calendar; charset=utf-8");
  if (r.status >= 400) throw new Error(`Titan event update failed (HTTP ${r.status}).`);
  return { uid };
}

/** Delete an event (matched by UID) via CalDAV DELETE. Also removes any local
 *  EventLink rows so the People/Projects Events tables stop showing it. */
export async function deleteTitanEvent(uid: string): Promise<{ uid: string }> {
  const found = await findTitanEventByUid(uid);
  if (!found) throw new Error(`No Titan event found matching "${uid}".`);
  const href = found.event.href || `${uid}.ics`;
  const icsUrl = new URL(href, found.calUrl).toString();
  const r = await dav(icsUrl, "DELETE");
  // 404 = already gone — treat as success so the UI doesn't get stuck.
  if (r.status >= 400 && r.status !== 404) throw new Error(`Titan event delete failed (HTTP ${r.status}).`);
  try {
    await prisma.eventLink.deleteMany({ where: { eventUid: found.event.uid } });
  } catch { /* links are best-effort cleanup */ }
  return { uid: found.event.uid };
}

/** Find an event by UID across calendars (fuzzy: exact uid, or title fragment). */
export async function findTitanEventByUid(query: string): Promise<{ event: TitanEvent; calUrl: string } | null> {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const cals = await discoverCalendars();
  for (const calUrl of cals) {
    let evs: TitanEvent[] = [];
    try { evs = await fetchEventsFromCalendar(calUrl); } catch { continue; }
    const exact = evs.find((e) => e.uid.toLowerCase() === q);
    if (exact) return { event: exact, calUrl };
    const byTitle = evs.find((e) => (e.summary || "").toLowerCase().includes(q));
    if (byTitle) return { event: byTitle, calUrl };
  }
  return null;
}

/** Backwards-compatible helper: events within ±days of now. */
export async function fetchTitanCalendar(daysPast = 30, daysFuture = 60): Promise<TitanEvent[]> {
  return fetchTitanEvents(new Date(Date.now() - daysPast * 86400000), new Date(Date.now() + daysFuture * 86400000));
}
