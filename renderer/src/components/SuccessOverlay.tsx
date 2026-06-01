import { useEffect, useRef, useState } from "react";
import { dollars } from "../api";
import { useCountUp } from "../hooks/useCountUp";
import { Confetti } from "./Confetti";
import type { Sale } from "../types";

export function SuccessOverlay(
  { sale, onShowReceipt, onNewSale, keyboardActive = true }: {
    sale: Sale;
    onShowReceipt: () => void;
    onNewSale: () => void;
    /** Disabled while the receipt preview is stacked on top, so Esc/Enter only
     *  drives the topmost modal. */
    keyboardActive?: boolean;
  },
) {
  const [confetti, setConfetti] = useState(true);
  const newSaleRef = useRef<HTMLButtonElement>(null);
  const total = useCountUp(sale.total_cents);
  const change = useCountUp(sale.change_cents ?? 0);

  useEffect(() => {
    newSaleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!keyboardActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") onNewSale();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [keyboardActive, onNewSale]);

  const showChange = sale.payment_type === "cash" && (sale.change_cents ?? 0) >= 0;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Sale complete"
      onClick={onNewSale}
    >
      <Confetti active={confetti} onDone={() => setConfetti(false)} />
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-2xl animate-overlay-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-brand text-4xl text-white animate-check-pop">
          ✓
        </div>
        <h2 className="text-xl font-black text-slate-900">Success!</h2>
        <p className="mb-5 text-sm text-slate-400">Sale #{sale.id} complete</p>

        <div className="mb-1 text-5xl font-black tabular-nums text-brand">
          {dollars(Math.round(total))}
        </div>
        {showChange && (
          <p className="mb-6 text-lg font-semibold text-emerald-600">
            Change&nbsp;{dollars(Math.round(change))}
          </p>
        )}
        {!showChange && <div className="mb-6" />}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onShowReceipt}
            className="rounded-2xl bg-slate-100 py-4 text-lg font-bold text-slate-700 transition hover:bg-slate-200"
          >
            Receipt
          </button>
          <button
            ref={newSaleRef}
            onClick={onNewSale}
            className="rounded-2xl bg-brand py-4 text-lg font-black text-white shadow-lg"
          >
            New Sale
          </button>
        </div>
      </div>
    </div>
  );
}
