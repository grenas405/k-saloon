import { useEffect, useRef, useState } from "react";
import { parseDollars } from "../api";

export function CustomItemModal(
  { onAdd, onClose }: {
    onAdd: (name: string, unitPriceCents: number) => void;
    onClose: () => void;
  },
) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cents = parseDollars(price);
  const valid = name.trim().length > 0 && cents > 0;

  function submit() {
    if (!valid) return;
    onAdd(name.trim(), cents);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Add custom item"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl animate-overlay-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-black text-slate-900">Custom Item</h2>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Name
          </span>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="e.g. Premium Whiskey"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base"
          />
        </label>
        <label className="mb-5 block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Price
          </span>
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="0.00"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-right text-lg font-bold"
          />
        </label>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-slate-100 py-3 font-semibold text-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid}
            className="flex-1 rounded-xl bg-brand py-3 font-bold text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
