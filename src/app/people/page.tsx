"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";
import PageHeader from "@/components/PageHeader";
import PersonTabs from "@/components/PersonTabs";
import ContactPhoto from "@/components/ContactPhoto";
import ContactFields from "@/components/ContactFields";
import InlineField from "@/components/InlineField";
import { IconBack, IconUpload } from "@/components/icons";
import ContactEditor from "@/components/ContactEditor";

function PeopleInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const selId = sp.get("person");
  const from = sp.get("from");
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const vcfRef = useRef<HTMLInputElement>(null);

  async function load() {
    const j = await fetch("/api/contacts").then((r) => r.json()).catch(() => []);
    const arr = Array.isArray(j) ? j : [];
    arr.sort((a, b) => a.name.localeCompare(b.name));
    setList(arr);
  }
  useEffect(() => { load(); }, []);

  async function importVcf(file?: File) {
    if (!file) return;
    setImportMsg("Importing…");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await fetch("/api/contacts/import", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "import failed");
      setImportMsg(`Imported ${j.created} contact${j.created === 1 ? "" : "s"}${j.skipped ? `, skipped ${j.skipped} duplicate${j.skipped === 1 ? "" : "s"}` : ""}.`);
    } catch (e: any) {
      setImportMsg(String(e?.message || e));
    } finally {
      load();
      setTimeout(() => setImportMsg(""), 6000);
    }
  }

  const sel = list.find((c) => c.id === selId) || null;
  const ql = q.trim().toLowerCase();
  const filtered = list.filter((c) =>
    !ql ||
    (c.name || "").toLowerCase().includes(ql) ||
    (c.email || "").toLowerCase().includes(ql) ||
    (c.company || "").toLowerCase().includes(ql) ||
    (c.phone || "").toLowerCase().includes(ql) ||
    (c.role || "").toLowerCase().includes(ql)
  );

  function selectPerson(id: string | null) {
    router.replace(id ? `/people?person=${id}` : "/people", { scroll: false });
  }

  async function saveField(id: string, patch: Record<string, string>) {
    await fetch("/api/contacts/detail", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch })
    });
    load();
  }

  async function del(id: string, name: string) {
    if (!confirm(`Delete ${name}?`)) return;
    await fetch(`/api/contacts/detail?id=${id}`, { method: "DELETE" });
    selectPerson(null); load();
  }

  if (sel) {
    return (
      <Shell wide>
        <button className="btn-ghost text-sm mb-3 flex items-center gap-1" onClick={() => (from ? router.push(from) : selectPerson(null))}>
          <IconBack /> {from ? "Back" : "People"}
        </button>
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          <div className="card w-full lg:w-72 shrink-0 h-fit">
            <div className="flex flex-col items-center mb-3">
              <ContactPhoto
                contactId={sel.id}
                photoUrl={sel.photo ? `/api/contacts/photo?id=${sel.id}` : null}
                onUploaded={load}
              />
              <div className="w-full mt-2">
                <InlineField label="Name" value={sel.name} placeholder="Full name"
                  onSave={(v) => saveField(sel.id, { name: v || sel.name })} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <ContactFields contactId={sel.id} kind="email" label="email" onChanged={load} />
              <ContactFields contactId={sel.id} kind="phone" label="phone" onChanged={load} />
              <InlineField label="Company" value={sel.company} placeholder="Company"
                onSave={(v) => saveField(sel.id, { company: v })} />
              <InlineField label="Role" value={sel.role} placeholder="Role"
                onSave={(v) => saveField(sel.id, { role: v })} />
              <InlineField label="Address" value={sel.address} placeholder="Address"
                onSave={(v) => saveField(sel.id, { address: v })} />
            </div>
            <button className="w-full mt-4 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl px-3 py-2 transition-colors" onClick={() => del(sel.id, sel.name)}>Delete</button>
          </div>
          <PersonTabs id={sel.id} onChanged={load} />
        </div>
      </Shell>
    );
  }

  return (
    <Shell wide>
      {/* single hidden input shared by both the desktop + mobile Import buttons */}
      <input ref={vcfRef} type="file" accept=".vcf,text/vcard,text/x-vcard" className="hidden"
        onChange={(e) => { importVcf(e.target.files?.[0]); e.target.value = ""; }} />
      <PageHeader icon="people" title="People" count={list.length}
        search={{ value: q, onChange: setQ, placeholder: "Search people…" }}
        actions={
          <>
            <button className="btn !py-1.5 flex items-center justify-center gap-1.5" onClick={() => vcfRef.current?.click()} title="Import .vcf contacts">
              <IconUpload /> Import .vcf
            </button>
            <button className="btn !py-1.5 flex items-center justify-center gap-1.5" onClick={() => setAdding(true)}><span className="text-base leading-none">+</span> Add</button>
          </>
        }
      />
      {importMsg && <div className="mb-3 text-sm text-slate-500">{importMsg}</div>}
      <div className="card !p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200 dark:border-zinc-800">
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium hidden sm:table-cell">Email</th>
            <th className="px-4 py-2 font-medium hidden sm:table-cell">Phone</th>
            <th className="px-4 py-2 font-medium">Company</th>
            <th className="px-4 py-2 font-medium hidden sm:table-cell">Role</th>
          </tr></thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} onClick={() => selectPerson(c.id)} className="table-row cursor-pointer">
                <td className="px-4 py-2 font-medium whitespace-nowrap">{c.name}</td>
                <td className="px-4 py-2 text-slate-500 dark:text-zinc-400 hidden sm:table-cell">{c.email || "—"}</td>
                <td className="px-4 py-2 text-slate-500 dark:text-zinc-400 hidden sm:table-cell">{c.phone || "—"}</td>
                <td className="px-4 py-2 text-slate-500 dark:text-zinc-400">{c.company || "—"}</td>
                <td className="px-4 py-2 text-slate-500 dark:text-zinc-400 hidden sm:table-cell">{c.role || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <div className="p-4 text-sm text-slate-500">No people yet.</div>}
      </div>
      {adding && <ContactEditor onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </Shell>
  );
}

export default function PeoplePage() {
  return (
    <Suspense fallback={<Shell><div className="card text-sm text-slate-500 animate-pulse">Loading…</div></Shell>}>
      <PeopleInner />
    </Suspense>
  );
}

