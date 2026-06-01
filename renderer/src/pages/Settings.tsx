import { useEffect, useState } from "react";
import { api } from "../api";
import type { Settings } from "../types";

export function SettingsPage(
  { settings, onSaved }: { settings: Settings; onSaved: () => void },
) {
  const [form, setForm] = useState<Settings>(settings);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setForm(settings), [settings]);

  async function save() {
    setError("");
    setSaved(false);
    try {
      const taxFraction = String(Number(form.tax_rate));
      await api.updateSettings({ ...form, tax_rate: taxFraction });
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-8">
      <div className="mx-auto max-w-xl space-y-5">
        <h2 className="text-2xl font-black">Settings</h2>

        <Card title="Business">
          <Field label="Name">
            <input className="input" value={form.business_name || ""}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
          </Field>
          <Field label="Address">
            <input className="input" value={form.business_address || ""}
              onChange={(e) => setForm({ ...form, business_address: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className="input" value={form.business_phone || ""}
              onChange={(e) => setForm({ ...form, business_phone: e.target.value })} />
          </Field>
        </Card>

        <Card title="Tax">
          <Field label="Tax rate (fraction, e.g. 0.08625 = 8.625%)">
            <input className="input" inputMode="decimal" value={form.tax_rate || ""}
              onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} />
            <p className="mt-1 text-xs text-slate-400">
              {(Number(form.tax_rate) * 100 || 0).toFixed(3)}% applied at register.
            </p>
          </Field>
        </Card>

        <Card title="Receipt">
          <Field label="Footer message (printed at the bottom of receipts)">
            <textarea className="input h-24" value={form.receipt_footer || ""}
              onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} />
            <p className="mt-1 text-xs text-slate-400">
              Line breaks are preserved. The logo prints automatically at the top.
            </p>
          </Field>
        </Card>

        <Card title="About">
          <p className="text-sm text-slate-500">
            K Saloon POS · version{" "}
            <span className="font-bold text-slate-700">{__APP_VERSION__}</span>
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Fully offline. Data and daily backups are stored locally on this PC.
          </p>
        </Card>

        <div className="flex items-center gap-3">
          <button onClick={save}
            className="rounded-xl bg-slate-900 px-6 py-3 font-bold text-white">
            Save Settings
          </button>
          {saved && <span className="text-sm font-semibold text-emerald-600">Saved ✓</span>}
          {error && <span className="text-sm font-semibold text-rose-600">{error}</span>}
        </div>
      </div>

      <style>{`
        .input { width:100%; border:1px solid #cbd5e1; border-radius:0.75rem; padding:0.5rem 0.75rem; font-size:0.95rem; }
      `}</style>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
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
