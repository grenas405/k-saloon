import { useEffect, useState } from "react";
import { api, dollars, parseDollars } from "../api";
import type { CatalogItem } from "../types";
import { CATEGORIES, COLORS } from "../catalog-meta";

const BLANK = {
  name: "",
  category: CATEGORIES[0] as string,
  price: "",
  color: COLORS[0] as string,
  description: "",
};

export function Catalog() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [form, setForm] = useState({ ...BLANK });
  const [editing, setEditing] = useState<number | null>(null);

  const load = () => api.getCatalog(true).then(setItems).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  function reset() {
    setForm({ ...BLANK });
    setEditing(null);
  }

  async function submit() {
    if (!form.name || !form.price) return;
    const body = {
      name: form.name,
      category: form.category,
      price_cents: parseDollars(form.price),
      color: form.color,
      description: form.description || null,
    };
    if (editing != null) await api.updateItem(editing, body);
    else await api.createItem(body);
    reset();
    load();
  }

  function edit(it: CatalogItem) {
    setEditing(it.id);
    setForm({
      name: it.name,
      category: it.category,
      price: (it.price_cents / 100).toFixed(2),
      color: it.color || COLORS[0],
      description: it.description || "",
    });
  }

  async function toggleActive(it: CatalogItem) {
    await api.updateItem(it.id, { active: it.active ? 0 : 1 });
    load();
  }

  async function remove(it: CatalogItem) {
    if (!window.confirm(`Permanently delete "${it.name}"? This cannot be undone.`)) return;
    await api.deleteItem(it.id, true);
    load();
  }

  return (
    <div className="grid h-full grid-cols-[360px_1fr] overflow-hidden">
      {/* Editor */}
      <section className="overflow-y-auto border-r border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold">
          {editing != null ? "Edit Item" : "New Item"}
        </h2>
        <div className="space-y-3">
          <Field label="Name">
            <input className="input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Category">
            <input list="cats" className="input" value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <datalist id="cats">
              {CATEGORIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
          <Field label="Price">
            <input className="input" inputMode="decimal" placeholder="0.00"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </Field>
          <Field label="Button color">
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  className={`h-8 w-8 rounded-full ${form.color === c ? "ring-2 ring-offset-2 ring-slate-900" : ""}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </Field>
          <Field label="Note (optional)">
            <textarea className="input h-20" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="flex gap-2 pt-2">
            <button onClick={submit}
              className="flex-1 rounded-xl bg-slate-900 py-3 font-bold text-white">
              {editing != null ? "Save" : "Add Item"}
            </button>
            {editing != null && (
              <button onClick={reset}
                className="rounded-xl bg-slate-100 px-4 py-3 font-semibold">Cancel</button>
            )}
          </div>
        </div>
      </section>

      {/* List */}
      <section className="overflow-y-auto p-5">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {items.map((it) => (
            <div key={it.id}
              className={`flex items-center gap-3 rounded-xl border bg-white p-3 ${it.active ? "border-slate-200" : "border-slate-200 opacity-60"}`}>
              <span className="h-10 w-10 shrink-0 rounded-lg"
                style={{ backgroundColor: it.color || "#475569" }} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {it.name}
                  {!it.active && <span className="ml-2 text-xs text-rose-500">(hidden)</span>}
                </p>
                <p className="text-xs text-slate-400">{it.category}</p>
              </div>
              <span className="font-bold">{dollars(it.price_cents)}</span>
              <div className="flex gap-1">
                <button onClick={() => edit(it)} className="btn-mini">Edit</button>
                <button onClick={() => toggleActive(it)} className="btn-mini">
                  {it.active ? "Hide" : "Show"}
                </button>
                <button onClick={() => remove(it)} className="btn-mini text-rose-600">Del</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <style>{`
        .input { width:100%; border:1px solid #cbd5e1; border-radius:0.75rem; padding:0.5rem 0.75rem; font-size:0.95rem; }
        .btn-mini { font-size:0.75rem; font-weight:600; padding:0.35rem 0.6rem; border-radius:0.5rem; background:#f1f5f9; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
