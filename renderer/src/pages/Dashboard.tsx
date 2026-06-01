import { useEffect, useState } from "react";
import { api, dollars } from "../api";
import type { Dashboard as Dash } from "../types";
import { useCountUp } from "../hooks/useCountUp";
import { ReceiptPreview } from "../components/ReceiptPreview";

type Range = "today" | "7d" | "30d";
const RANGES: Array<{ id: Range; label: string }> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
];

export function Dashboard() {
  const [range, setRange] = useState<Range>("today");
  const [data, setData] = useState<Dash | null>(null);
  const [previewSaleId, setPreviewSaleId] = useState<number | null>(null);

  useEffect(() => {
    api.getDashboard(range).then(setData).catch(() => setData(null));
  }, [range]);

  const empty = data && data.current.count === 0;

  return (
    <div className="h-full overflow-y-auto bg-slate-900 p-6 text-slate-100">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-black">Command Center</h2>
        <div className="flex gap-1 rounded-xl bg-slate-800 p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                range === r.id ? "bg-slate-100 text-slate-900" : "text-slate-400"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!data && <p className="text-slate-400">Loading…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Revenue" value={data.current.revenue_cents}
              prev={data.previous.revenue_cents} money />
            <Kpi label="Transactions" value={data.current.count}
              prev={data.previous.count} />
            <Kpi label="Avg Ticket" value={data.current.avg_ticket_cents}
              prev={data.previous.avg_ticket_cents} money />
            <Kpi label="Items Sold" value={data.current.items_sold}
              prev={data.previous.items_sold} />
          </div>

          {empty && (
            <div className="mt-10 rounded-2xl border border-dashed border-slate-700 p-12 text-center text-slate-400">
              <p className="text-lg font-semibold">No sales in this range yet.</p>
              <p className="text-sm">Ring up a ticket on the Register tab to see it here.</p>
            </div>
          )}

          {!empty && (
            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-2xl bg-slate-800 p-5 lg:col-span-2">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
                  Revenue
                </h3>
                <Sparkline series={data.series} />
              </div>
              <div className="rounded-2xl bg-slate-800 p-5">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
                  Cash vs Card
                </h3>
                <MixBar
                  cash={data.payment_mix.cash_cents}
                  card={data.payment_mix.card_cents}
                />
              </div>
            </div>
          )}

          <div className="mt-6 rounded-2xl bg-slate-800 p-5">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
              Recent
            </h3>
            {data.recent.length === 0 && (
              <p className="text-sm text-slate-500">Nothing yet.</p>
            )}
            <ul className="divide-y divide-slate-700">
              {data.recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-400">
                    #{r.id} · {new Date(r.created_at).toLocaleTimeString()} · {r.item_count} items
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs capitalize">
                      {r.payment_type}
                    </span>
                    <span className="font-bold">{dollars(r.total_cents)}</span>
                    <button
                      onClick={() => setPreviewSaleId(r.id)}
                      className="text-xs text-cyan-400 hover:underline"
                    >
                      reprint
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {previewSaleId !== null && (
        <ReceiptPreview
          saleId={previewSaleId}
          onClose={() => setPreviewSaleId(null)}
        />
      )}
    </div>
  );
}

function Kpi(
  { label, value, prev, money }: {
    label: string;
    value: number;
    prev: number;
    money?: boolean;
  },
) {
  const animated = useCountUp(value);
  const display = money
    ? dollars(Math.round(animated))
    : Math.round(animated).toLocaleString();
  const delta = prev > 0 ? ((value - prev) / prev) * 100 : value > 0 ? 100 : 0;
  const up = delta >= 0;

  return (
    <div className="rounded-2xl bg-slate-800 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-3xl font-black tabular-nums">{display}</p>
      <span
        className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
          up ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
        }`}
      >
        {up ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}% vs prior
      </span>
    </div>
  );
}

function Sparkline({ series }: { series: Array<{ date: string; revenue_cents: number }> }) {
  const w = 600, h = 140, pad = 8;
  const max = Math.max(1, ...series.map((s) => s.revenue_cents));
  const step = series.length > 1 ? (w - pad * 2) / (series.length - 1) : 0;
  const pts = series.map((s, i) => {
    const x = pad + i * step;
    const y = h - pad - (s.revenue_cents / max) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const area = `${line} L${pad + (series.length - 1) * step},${h - pad} L${pad},${h - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark)" />
      <path d={line} fill="none" stroke="#22d3ee" strokeWidth={2.5}
        strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} fill="#22d3ee" />
      ))}
    </svg>
  );
}

function MixBar({ cash, card }: { cash: number; card: number }) {
  const total = cash + card;
  const cashPct = total > 0 ? (cash / total) * 100 : 0;
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full bg-slate-700">
        <div className="bg-emerald-400" style={{ width: `${cashPct}%` }} />
        <div className="bg-amber-400" style={{ width: `${100 - cashPct}%` }} />
      </div>
      <div className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-emerald-400">● Cash</span>
          <span className="font-bold">{dollars(cash)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-amber-400">● Card</span>
          <span className="font-bold">{dollars(card)}</span>
        </div>
      </div>
    </div>
  );
}
