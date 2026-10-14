// Lightweight vCard (.vcf) parser — no external dependency.
// Supports vCard 2.1 / 3.0 / 4.0. Extracts the fields we store:
// Name, Email, Phone, Company, Role, Address, Profile Picture (base64 or URL).
// We intentionally discard everything else as allowed by the requirements.

export type ParsedContact = {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  address?: string;
  photo?: { data: Buffer; ext: string } | { url: string } | null;
  emails?: { value: string; label?: string }[]; // all parsed emails (first = default)
  phones?: { value: string; label?: string }[]; // all parsed phones (first = default)
};

/** Extract a TYPE label (e.g. work, home, cell) from vCard params. */
function typeLabel(params: string[]): string | undefined {
  for (const p of params) {
    const m = p.match(/^type=([^;:]+)/i);
    if (m) {
      // TYPE may be comma-separated: "TYPE=work,pref" -> "work"
      const first = m[1].split(",")[0].trim();
      if (first && !/pref|internet|voice|x-/i.test(first)) return first.toLowerCase();
    }
  }
  return undefined;
}

/** Split a raw vCard text into unfolded logical lines. */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n|\r/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of raw) {
    if (/^[ \t]/.test(line) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/** Split on a separator respecting double-quoted segments. */
function splitRespectingQuotes(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') inQ = !inQ;
    if (ch === sep && !inQ) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Parse one logical property line into name, params, value. */
function parseLine(line: string): { name: string; params: string[]; value: string } | null {
  let inQ = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQ = !inQ;
    else if (ch === ":" && !inQ) { colon = i; break; }
  }
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = splitRespectingQuotes(head, ";");
  const name = (parts.shift() || "").trim().toUpperCase();
  const params = parts.map((p) => p.trim());
  return { name, params, value };
}

/** Unescape vCard 3.0 text values. */
function unescape(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function photoExtFromParams(params: string[]): string {
  let type = "";
  for (const p of params) {
    const m = p.match(/^type=([^;:]+)/i);
    if (m) type = m[1].toLowerCase();
  }
  const map: Record<string, string> = {
    jpeg: ".jpg", jpg: ".jpg", png: ".png", gif: ".gif", webp: ".webp", svg: ".svg", bmp: ".bmp"
  };
  return (type && map[type]) || ".jpg";
}

function composeName(n: string): string {
  const [last, first, middle, prefix, suffix] = n.split(";");
  return [prefix, first, middle, last, suffix]
    .map((s) => unescape((s || "").trim()))
    .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function parseVcf(text: string): ParsedContact[] {
  const lines = unfold(text);
  const cards: ParsedContact[] = [];
  let cur: any = null;
  let photoLines: string[] = [];

  function flushPhoto() {
    if (!cur || !photoLines.length) { photoLines = []; return; }
    try {
      const buf = Buffer.from(photoLines.join(""), "base64");
      if (buf.length && !cur.photo) cur.photo = { data: buf, ext: cur._photoExt || ".jpg" };
    } catch { /* ignore bad photo */ }
    photoLines = [];
  }

  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VCARD") { cur = { name: "" }; photoLines = []; continue; }
    if (upper === "END:VCARD") {
      flushPhoto();
      if (cur && cur.name) cards.push(strip(cur));
      cur = null;
      continue;
    }
    if (!cur) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { name, params, value } = parsed;

    if (name === "FN") {
      const v = unescape(value.trim());
      if (v && !cur._hasFn) { cur.name = v; cur._hasFn = true; }
    } else if (name === "N") {
      const composed = composeName(value);
      if (composed && !cur.name) cur.name = composed;
    } else if (name === "EMAIL") {
      const v = unescape(value.trim());
      if (v) {
        (cur.emails ||= []).push({ value: v, label: typeLabel(params) });
        if (!cur.email) cur.email = v; // first email = default
      }
    } else if (name === "TEL") {
      const v = unescape(value.trim());
      if (v) {
        (cur.phones ||= []).push({ value: v, label: typeLabel(params) });
        if (!cur.phone) cur.phone = v; // first phone = default
      }
    } else if (name === "ORG") {
      if (!cur.company && value.trim()) {
        const first = value.split(";").map((s) => unescape(s.trim())).filter(Boolean)[0];
        if (first) cur.company = first;
      }
    } else if (name === "TITLE") {
      if (!cur.role && value.trim()) cur.role = unescape(value.trim());
    } else if (name === "ADR") {
      if (!cur.address && value.trim()) {
        const parts = value.split(";").map((s) => unescape(s.trim()));
        const [pobox, , street, city, state, zip, country] = parts;
        const joined = [street, city, state, zip, country].filter(Boolean).join(", ")
          || [pobox, city, state, zip, country].filter(Boolean).join(", ");
        if (joined) cur.address = joined;
      }
    } else if (name === "PHOTO" || name === "LOGO") {
      const isBase64 = params.some((p) => /encoding=b(ase64)?/i.test(p));
      const isUri = params.some((p) => /^value=uri/i.test(p)) || /^https?:\/\//i.test(value.trim());
      if (isBase64) {
        cur._photoExt = photoExtFromParams(params);
        photoLines.push(value.trim());
      } else if (isUri && value.trim() && !cur.photo) {
        cur.photo = { url: value.trim() };
      }
    }
  }
  return cards;
}

function strip(c: any): ParsedContact {
  const out: ParsedContact = { name: c.name };
  if (c.email) out.email = c.email;
  if (c.phone) out.phone = c.phone;
  if (c.company) out.company = c.company;
  if (c.role) out.role = c.role;
  if (c.address) out.address = c.address;
  if (c.photo) out.photo = c.photo;
  if (Array.isArray(c.emails) && c.emails.length) out.emails = c.emails;
  if (Array.isArray(c.phones) && c.phones.length) out.phones = c.phones;
  return out;
}
