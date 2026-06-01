import { useEffect, useMemo, useState } from "react";
import { api, dollars, parseDollars } from "../api";
import type { CartLine, CatalogItem, Sale } from "../types";
import { useCountUp } from "../hooks/useCountUp";
import { useSound } from "../hooks/useSound";
import { SuccessOverlay } from "../components/SuccessOverlay";
import { CustomItemModal } from "../components/CustomItemModal";
import { ReceiptPreview } from "../components/ReceiptPreview";
import logoUrl from "../assets/K-Saloon.svg";

const QUICK_CASH = [2000, 4000, 6000, 10000]; // cents

export function Register() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [taxRate, setTaxRate] = useState(0);
  const [activeCat, setActiveCat] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<"cash" | "card">("cash");
  const [tendered, setTendered] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [previewSaleId, setPreviewSaleId] = useState<number | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [error, setError] = useState("");

  const sound = useSound();

  const load = () => {
    api.getCatalog(false).then(setItems).catch(() => {});
    api.getSettings().then((s) => setTaxRate(Number(s.tax_rate) || 0)).catch(() => {});
  };
  useEffect(load, []);

  // Category counts for the tab strip.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.category, (m.get(it.category) ?? 0) + 1);
    return m;
  }, [items]);
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(items.map((i) => i.category)))],
    [items],
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) =>
      (activeCat === "All" || i.category === activeCat) &&
      (q === "" || i.name.toLowerCase().includes(q))
    );
  }, [items, activeCat, search]);

  const subtotal = cart.reduce((s, l) => s + l.unit_price_cents * l.qty, 0);
  const tax = Math.round(subtotal * taxRate);
  const total = subtotal + tax;
  const animatedTotal = useCountUp(total);
  const tenderedCents = parseDollars(tendered);
  const change = payment === "cash" ? Math.max(0, tenderedCents - total) : 0;
  const itemCount = cart.reduce((s, l) => s + l.qty, 0);

  function addItem(name: string, unit_price_cents: number) {
    setError("");
    setCart((prev) => {
      const key = `${name}:${unit_price_cents}`;
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { key, name, unit_price_cents, qty: 1 }];
    });
  }

  function setQty(key: string, qty: number) {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((l) => l.key !== key)
        : prev.map((l) => (l.key === key ? { ...l, qty } : l))
    );
  }

  function clearSale() {
    setCart([]);
    setTendered("");
    setLastSale(null);
    setPreviewSaleId(null);
    setError("");
  }

  async function complete() {
    if (cart.length === 0 || busy) return;
    if (payment === "cash" && tenderedCents < total) {
      setError("Cash tendered is less than the total.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const sale = await api.createSale({
        items: cart.map((l) => ({
          name: l.name,
          unit_price_cents: l.unit_price_cents,
          qty: l.qty,
        })),
        payment_type: payment,
        cash_tendered_cents: payment === "cash" ? tenderedCents : null,
      });
      setLastSale(sale);
      sound.play();
    } catch (e) {
      setError("Could not complete sale: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid h-full grid-cols-[1fr_400px] bg-slate-50">
      {/* Catalog */}
      <section className="flex min-h-0 flex-col p-4">
        {/* Search + category strip */}
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-amber-500 focus:outline-none"
            />
          </div>
          <button
            onClick={sound.toggle}
            title={sound.enabled ? "Sound on" : "Sound off"}
            className="h-10 w-10 shrink-0 rounded-xl bg-white text-lg shadow-sm"
          >
            {sound.enabled ? "🔊" : "🔇"}
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2 overflow-x-auto">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCat(c)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition ${
                activeCat === c
                  ? "bg-brand text-white shadow"
                  : "bg-white text-slate-600 shadow-sm hover:bg-slate-100"
              }`}
            >
              {c}
              {c !== "All" && (
                <span className={`rounded-full px-1.5 text-xs ${activeCat === c ? "bg-white/25" : "bg-slate-100 text-slate-400"}`}>
                  {counts.get(c) ?? 0}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tiles */}
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-3 gap-3 overflow-y-auto pr-1 lg:grid-cols-4">
          {shown.map((it) => (
            <button
              key={it.id}
              onClick={() => addItem(it.name, it.price_cents)}
              className="tile font-display"
              style={{ ["--tile-color" as string]: it.color || "#475569" }}
            >
              <span className="text-sm font-extrabold leading-tight drop-shadow-sm">{it.name}</span>
              <span className="text-xl font-black drop-shadow-sm">{dollars(it.price_cents)}</span>
            </button>
          ))}
          <button
            onClick={() => setCustomOpen(true)}
            className="flex h-28 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 text-slate-500 transition hover:border-amber-500 hover:bg-white hover:text-amber-700"
          >
            <span className="text-3xl">＋</span>
            <span className="text-sm font-bold">Custom</span>
          </button>
          {shown.length === 0 && (
            <p className="col-span-full mt-10 text-center text-sm text-slate-400">
              No items match "{search}".
            </p>
          )}
        </div>
      </section>

      {/* Cart / payment */}
      <aside className="flex min-h-0 flex-col border-l border-slate-200 bg-white">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Cart</h2>
          {itemCount > 0 && (
            <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-white">
              {itemCount} item{itemCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {cart.length === 0 && (
            <div className="hero-glow flex h-full min-h-0 flex-col items-center justify-center text-center animate-hero-rise">
              <img
                src={logoUrl}
                alt="K Saloon"
                className="h-auto w-auto max-h-[45%] max-w-[16rem] object-contain animate-float"
              />
              <div className="mt-6 flex flex-col items-center gap-1 animate-pop-in">
                <p className="text-sm font-medium tracking-wide text-slate-400">
                  Tap an item to start a ticket.
                </p>
              </div>
            </div>
          )}
          <ul className="space-y-2">
            {cart.map((l) => (
              <li
                key={l.key}
                className="flex items-center gap-2 rounded-xl bg-slate-50 p-2 animate-pop-in"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{l.name}</p>
                  <p className="text-xs text-slate-400">{dollars(l.unit_price_cents)} ea</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setQty(l.key, l.qty - 1)}
                    className="h-8 w-8 rounded-lg bg-white font-bold text-slate-600 shadow-sm active:animate-pop">−</button>
                  <span className="w-6 text-center text-sm font-bold tabular-nums">{l.qty}</span>
                  <button onClick={() => setQty(l.key, l.qty + 1)}
                    className="h-8 w-8 rounded-lg bg-white font-bold text-slate-600 shadow-sm active:animate-pop">＋</button>
                </div>
                <span className="w-16 text-right text-sm font-bold tabular-nums">
                  {dollars(l.unit_price_cents * l.qty)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-slate-200 p-4">
          <div className="mb-3 space-y-1 text-sm">
            <Row label="Subtotal" value={dollars(subtotal)} />
            <Row label={`Tax (${(taxRate * 100).toFixed(3)}%)`} value={dollars(tax)} />
            <div className="flex items-baseline justify-between border-t border-slate-200 pt-1">
              <span className="text-lg font-black">Total</span>
              <span className="text-2xl font-black tabular-nums text-brand">
                {dollars(Math.round(animatedTotal))}
              </span>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            {(["cash", "card"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPayment(p)}
                className={`rounded-xl py-2 text-sm font-bold capitalize transition ${
                  payment === p ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {p === "cash" ? "Cash" : "Card"}
              </button>
            ))}
          </div>

          {payment === "cash" && (
            <div className="mb-3 space-y-2">
              <div className="grid grid-cols-4 gap-1.5">
                {QUICK_CASH.map((c) => (
                  <button
                    key={c}
                    onClick={() => setTendered((c / 100).toFixed(0))}
                    className="rounded-lg bg-slate-100 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200"
                  >
                    ${c / 100}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setTendered((total / 100).toFixed(2))}
                className="w-full rounded-lg bg-slate-100 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-200"
              >
                Exact · {dollars(total)}
              </button>
              <input
                inputMode="decimal"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                placeholder="Cash tendered"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-right text-lg font-bold focus:border-amber-500 focus:outline-none"
              />
              {tenderedCents > 0 && (
                <p className="text-right text-sm font-semibold text-emerald-600">
                  Change: {dollars(change)}
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 animate-slide-in">
              {error}
            </p>
          )}

          <button
            onClick={complete}
            disabled={cart.length === 0 || busy}
            className="cta bg-brand disabled:opacity-40"
          >
            {busy ? "Processing…" : (
              <span className="relative z-10">Complete · {dollars(total)}</span>
            )}
          </button>
        </div>
      </aside>

      {customOpen && (
        <CustomItemModal onAdd={addItem} onClose={() => setCustomOpen(false)} />
      )}
      {lastSale && (
        <SuccessOverlay
          sale={lastSale}
          onShowReceipt={() => setPreviewSaleId(lastSale.id)}
          onNewSale={clearSale}
          keyboardActive={previewSaleId === null}
        />
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-500">
      <span>{label}</span>
      <span className="font-semibold text-slate-700">{value}</span>
    </div>
  );
}
