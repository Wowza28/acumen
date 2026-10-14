import { NextRequest, NextResponse } from "next/server";
import {
  addContactFields,
  removeContactField,
  setContactFieldDefault,
  updateContactFieldValue,
  getContactFields
} from "@/lib/contactFields";

// Manages the multi-value email/phone rows for a contact.
// JSON body always includes `id` (contact id) and `kind` ("email" | "phone").
//   op="add"        + values[]  (or value)   → add one/more rows
//   op="remove"     + rowId                    → delete a row
//   op="setDefault" + rowId                    → make a row the default
//   op="edit"       + rowId (+ value/label)    → change value/label
//   op="list"                                    → return the current arrays
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const { id, kind } = b;
    if (!id || (kind !== "email" && kind !== "phone")) {
      return NextResponse.json({ error: "id and kind(email|phone) required" }, { status: 400 });
    }
    switch (b.op) {
      case "add": {
        const raw = (b.values?.length ? b.values : b.value != null ? [b.value] : []);
        const items = raw.map((v: any) =>
          typeof v === "object" ? { value: String(v.value || "").trim(), label: v.label, isDefault: !!v.isDefault } : { value: String(v).trim() }
        ).filter((x: any) => x.value);
        if (!items.length) return NextResponse.json({ error: "no values" }, { status: 400 });
        await addContactFields(id, kind === "email" ? { emails: items } : { phones: items });
        break;
      }
      case "remove": {
        if (!b.rowId) return NextResponse.json({ error: "rowId required" }, { status: 400 });
        await removeContactField(b.rowId, kind);
        break;
      }
      case "setDefault": {
        if (!b.rowId) return NextResponse.json({ error: "rowId required" }, { status: 400 });
        await setContactFieldDefault(b.rowId, kind);
        break;
      }
      case "edit": {
        if (!b.rowId) return NextResponse.json({ error: "rowId required" }, { status: 400 });
        await updateContactFieldValue(b.rowId, kind, { value: b.value, label: b.label });
        break;
      }
      case "list":
        break;
      default:
        return NextResponse.json({ error: `unknown op ${b.op}` }, { status: 400 });
    }
    const fields = await getContactFields(id);
    return NextResponse.json(fields);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
