import { useEffect, useMemo, useState } from "react";
import { api, dollars } from "../api";
import type { CloseoutReport, DayReport, Sale } from "../types";
import { ReceiptPreview } from "../components/ReceiptPreview";
import { HtmlPreview } from "../components/HtmlPreview";

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function History() {
  const [date, setDate] = useState(todayString());
  const [day, setDay] = useState<DayReport | null>(null);
  const [closeout, setCloseout] = useState<CloseoutReport | null>(null);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [previewSaleId, setPreviewSaleId] = useState<number | null>(null);
  const [closeoutHtml, setCloseoutHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    try {
      const [dayData, closeoutData] = await Promise.all([
        api.getDay(date),
        api.getCloseout(date),
      ]);
      setDay(dayData);
      setCloseout(closeoutData);
      if (selected) {
        const refreshed = dayData.sales.find((s) => s.id === selected.id);
        if (!refreshed) setSelected(null);
      }
    } catch (e) {
      setError((e as Error).message);
      setDay(null);
      setCloseout(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function selectSale(id: number) {
    setError("");
    try {
      setSelected(await api.getSale(id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function voidSelected() {
    if (!selected || selected.status === "void") return;
    const reason = window.prompt(`Reason for voiding ticket #${selected.id}?`);
    if (reason == null) return;
    if (!window.confirm(`Void ticket #${selected.id}? This keeps it in history but removes it from reports.`)) {
      return;
    }
    try {
      const updated = await api.voidSale(selected.id, reason);
      setSelected(updated);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function previewCloseout() {
    setError("");
    try {
      setCloseoutHtml(await api.getCloseoutHtml(date));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function downloadCsv(type: "sales" | "lines") {
    setError("");
    try {
      const res = await fetch(api.exportUrl(type, date, date));
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `k-saloon-${type}-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const sales = day?.sales ?? [];
  const selectedLines = selected?.lines ?? [];
  const tender = selected?.payment_type === "cash"
    ? selected.cash_tendered_cents ?? 0
    : selected?.total_cents ?? 0;
  const closeoutRange = useMemo(() => {
    if (!closeout?.first_sale_at) return "No paid tickets";
    const first = new Date(closeout.first_sale_at).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    const last = closeout.last_sale_at
      ? new Date(closeout.last_sale_at).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
      : first;
    return `${first} - ${last}`;
  }, [closeout]);

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_390px] overflow-hidden bg-slate-50">
      <section className="min-h-0 overflow-y-auto p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black">History</h2>
            <p className="text-sm text-slate-500">Tickets, voids, closeout, and exports.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold shadow-sm"
            />
            <button onClick={load} className="btn-history">Refresh</button>
            <button onClick={() => downloadCsv("sales")} className="btn-history">
              Sales CSV
            </button>
            <button onClick={() => downloadCsv("lines")} className="btn-history">
              Lines CSV
            </button>
          </div>
        </div>

        {error && (
          <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Revenue" value={dollars(closeout?.revenue_cents ?? 0)} />
          <Kpi label="Cash Drawer" value={dollars(closeout?.cash_cents ?? 0)} />
          <Kpi label="Card" value={dollars(closeout?.card_cents ?? 0)} />
          <Kpi label="Voids" value={String(closeout?.void_count ?? 0)} warn />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                Tickets
              </h3>
              <span className="text-xs font-semibold text-slate-400">
                {busy ? "Loading..." : `${sales.length} total`}
              </span>
            </div>
            {sales.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
                No tickets for this day.
              </div>
            )}
            <ul className="divide-y divide-slate-100">
              {sales.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => selectSale(s.id)}
                    className={`grid w-full grid-cols-[88px_1fr_88px_92px] items-center gap-3 px-2 py-3 text-left text-sm transition hover:bg-slate-50 ${
                      selected?.id === s.id ? "bg-amber-50" : ""
                    } ${s.status === "void" ? "text-rose-700" : "text-slate-700"}`}
                  >
                    <span className="font-black tabular-nums">#{s.id}</span>
                    <span>
                      <span className="font-semibold">
                        {new Date(s.created_at).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="ml-2 text-xs capitalize text-slate-400">
                        {s.payment_type} · {s.item_count} item{s.item_count === 1 ? "" : "s"}
                      </span>
                    </span>
                    <StatusPill status={s.status} />
                    <span className="text-right font-black tabular-nums">
                      {dollars(s.total_cents)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                Closeout
              </h3>
              <button onClick={previewCloseout} className="btn-history">Preview</button>
            </div>
            <div className="space-y-2 text-sm">
              <CloseoutRow label="Paid tickets" value={String(closeout?.paid_count ?? 0)} />
              <CloseoutRow label="Items sold" value={String(closeout?.item_count ?? 0)} />
              <CloseoutRow label="Average ticket" value={dollars(closeout?.avg_ticket_cents ?? 0)} />
              <CloseoutRow label="Subtotal" value={dollars(closeout?.subtotal_cents ?? 0)} />
              <CloseoutRow label="Tax" value={dollars(closeout?.tax_cents ?? 0)} />
              <CloseoutRow label="Voided total" value={dollars(closeout?.void_total_cents ?? 0)} />
              <CloseoutRow label="Window" value={closeoutRange} />
            </div>
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                Top Items
              </p>
              {closeout?.top_items.length
                ? (
                  <ul className="space-y-1 text-sm">
                    {closeout.top_items.slice(0, 5).map((it) => (
                      <li key={it.name} className="flex justify-between gap-3">
                        <span className="truncate text-slate-600">{it.name}</span>
                        <span className="shrink-0 font-bold">{it.qty} · {dollars(it.total_cents)}</span>
                      </li>
                    ))}
                  </ul>
                )
                : <p className="text-sm text-slate-400">No paid items.</p>}
            </div>
          </div>
        </div>
      </section>

      <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-white p-5">
        {!selected && (
          <div className="flex h-full flex-col justify-center text-center text-slate-400">
            <p className="text-sm font-semibold">Select a ticket to inspect it.</p>
          </div>
        )}
        {selected && (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-black">Ticket #{selected.id}</h3>
                <p className="text-sm text-slate-400">
                  {new Date(selected.created_at).toLocaleString()}
                </p>
              </div>
              <StatusPill status={selected.status} />
            </div>

            {selected.status === "void" && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <p className="font-bold">Voided</p>
                <p>{selected.void_reason || "No reason provided"}</p>
              </div>
            )}

            <div className="space-y-2">
              {selectedLines.map((l) => (
                <div key={l.id} className="rounded-xl bg-slate-50 p-3">
                  <div className="flex justify-between gap-3">
                    <p className="font-semibold">{l.name}</p>
                    <p className="font-black">{dollars(l.line_total_cents)}</p>
                  </div>
                  <p className="text-xs text-slate-400">
                    {l.qty} x {dollars(l.unit_price_cents)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-1 border-t border-slate-200 pt-4 text-sm">
              <CloseoutRow label="Subtotal" value={dollars(selected.subtotal_cents)} />
              <CloseoutRow label="Tax" value={dollars(selected.tax_cents)} />
              <CloseoutRow label="Tendered" value={dollars(tender)} />
              {selected.payment_type === "cash" && (
                <CloseoutRow label="Change" value={dollars(selected.change_cents ?? 0)} />
              )}
              <div className="flex justify-between pt-2 text-lg font-black">
                <span>Total</span>
                <span>{dollars(selected.total_cents)}</span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={() => setPreviewSaleId(selected.id)}
                className="rounded-xl bg-slate-900 py-3 text-sm font-black text-white"
              >
                Receipt
              </button>
              <button
                onClick={voidSelected}
                disabled={selected.status === "void"}
                className="rounded-xl bg-rose-600 py-3 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400"
              >
                Void
              </button>
            </div>
          </>
        )}
      </aside>

      {previewSaleId !== null && (
        <ReceiptPreview
          saleId={previewSaleId}
          onClose={() => setPreviewSaleId(null)}
        />
      )}
      {closeoutHtml !== null && (
        <HtmlPreview
          title={`Closeout ${date}`}
          html={closeoutHtml}
          defaultFileName={`closeout-${date}.pdf`}
          onClose={() => setCloseoutHtml(null)}
        />
      )}

      <style>{`
        .btn-history { border-radius:0.75rem; background:#fff; border:1px solid #cbd5e1; padding:0.55rem 0.8rem; font-size:0.8rem; font-weight:800; color:#334155; box-shadow:0 1px 1px rgb(15 23 42 / 0.04); }
      `}</style>
    </div>
  );
}

function Kpi({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${warn ? "text-rose-600" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: "paid" | "void" }) {
  return (
    <span
      className={`justify-self-start rounded-full px-2 py-0.5 text-xs font-black uppercase ${
        status === "void" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
      }`}
    >
      {status}
    </span>
  );
}

function CloseoutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-bold tabular-nums text-slate-800">{value}</span>
    </div>
  );
}
