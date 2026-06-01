import { useEffect, useRef, useState } from "react";
import { api } from "../api";

/** In-app receipt preview: renders the receipt HTML in a sandboxed iframe so
 *  staff see exactly what prints. Print uses the Electron bridge when available
 *  (window.app.printDoc), otherwise falls back to the iframe's own print (which
 *  gives the browser's native print preview during dev). */
export function ReceiptPreview(
  { saleId, onClose }: { saleId: number; onClose: () => void },
) {
  const [html, setHtml] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let active = true;
    api.getReceiptHtml(saleId)
      .then((h) => active && setHtml(h))
      .catch(() =>
        active &&
        setHtml(
          "<p style='font-family:sans-serif;padding:16px'>Failed to load receipt.</p>",
        )
      );
    return () => {
      active = false;
    };
  }, [saleId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function doPrint() {
    if (window.app?.printDoc && html != null) {
      await window.app.printDoc(html);
    } else {
      const f = iframeRef.current;
      f?.contentWindow?.focus();
      f?.contentWindow?.print();
    }
  }

  async function doSavePdf() {
    if (window.app?.savePdf && html != null) {
      await window.app.savePdf(html, `receipt-${saleId}.pdf`);
    } else {
      window.open(api.receiptUrl(saleId), "_blank");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-slate-900/70 p-4 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Receipt preview"
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full w-full max-w-md flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between text-white">
          <h2 className="font-display text-lg font-extrabold">Receipt Preview</h2>
          <button
            onClick={onClose}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-white shadow-2xl">
          {html == null
            ? (
              <div className="flex h-full items-center justify-center text-slate-400">
                Loading…
              </div>
            )
            : (
              <iframe
                ref={iframeRef}
                title="Receipt"
                srcDoc={html}
                sandbox="allow-same-origin allow-modals"
                className="h-full w-full border-0"
              />
            )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={doPrint} className="cta bg-brand">
            <span className="relative z-10">Print</span>
          </button>
          <button
            onClick={doSavePdf}
            className="rounded-2xl bg-white py-4 text-lg font-black text-slate-700 shadow-lg transition hover:bg-slate-100"
          >
            Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
