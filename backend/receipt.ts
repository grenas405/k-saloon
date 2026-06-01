// receipt.ts — printable, brand-accented receipt HTML (print or save-PDF).
import type { Db, Sale } from "./db.ts";
import { LOGO_DATA_URI } from "./logo.ts";

const BRAND = "#b45309";
const DEFAULT_FOOTER = "Thank you for visiting K Saloon!\nPlease come again.";

function fmt(cents: number): string {
  return "$" + (cents / 100).toFixed(2);
}

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (
      c,
    ) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]!),
  );
}

export function renderReceipt(db: Db, sale: Sale): string {
  const settings = db.getSettings();
  const lines = db.getSaleLines(sale.id);
  const name = settings.business_name || "K Saloon";
  const footer = settings.receipt_footer ?? DEFAULT_FOOTER;
  const dateLabel = new Date(sale.created_at).toLocaleString();

  const lineRows = lines
    .map((l) => {
      const sub = l.qty > 1
        ? `<div class="sub">${l.qty} × ${fmt(l.unit_price_cents)}</div>`
        : "";
      return `
        <tr>
          <td>${esc(l.name)}${sub}</td>
          <td class="amt">${fmt(l.line_total_cents)}</td>
        </tr>`;
    })
    .join("");

  const payRows = sale.payment_type === "cash"
    ? `
        <tr><td><span class="badge">Cash</span></td><td class="amt">${
      fmt(sale.cash_tendered_cents ?? 0)
    }</td></tr>
        <tr><td>Change</td><td class="amt">${
      fmt(sale.change_cents ?? 0)
    }</td></tr>`
    : `<tr><td><span class="badge">Card</span></td><td class="amt">${
      fmt(sale.total_cents)
    }</td></tr>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Receipt #${sale.id}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #111; margin: 0; padding: 16px; font-variant-numeric: tabular-nums;
  }
  @media print { body { width: 80mm; padding: 4mm; } }
  .receipt { max-width: 300px; margin: 0 auto; }
  .logo { display: block; margin: 0 auto 6px; max-width: 200px; width: 70%; height: auto; }
  .rule { height: 3px; background: ${BRAND}; border-radius: 2px; margin: 6px 0 10px; }
  .meta { text-align: center; font-size: 11px; line-height: 1.5; color: #555; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 3px 0; vertical-align: top; }
  .amt { text-align: right; white-space: nowrap; font-weight: 600; }
  .sub { font-size: 11px; color: #888; }
  .divider td { border-top: 1px dashed #bbb; padding-top: 8px; }
  .badge { display: inline-block; font-size: 11px; font-weight: 700; color: #444; }
  .total-row td {
    background: ${BRAND}; color: #fff; font-weight: 800; font-size: 16px;
    padding: 8px 10px;
  }
  .total-row td:first-child { border-radius: 8px 0 0 8px; letter-spacing: 0.05em; }
  .total-row td:last-child { border-radius: 0 8px 8px 0; }
  .spacer td { height: 8px; }
  .foot {
    text-align: center; font-size: 11px; line-height: 1.6; color: #555; margin-top: 16px;
    white-space: pre-line;
  }
</style></head>
<body><div class="receipt">
  <img class="logo" src="${LOGO_DATA_URI}" alt="${esc(name)}" />
  <div class="rule"></div>
  <div class="meta">
    ${settings.business_address ? esc(settings.business_address) + "<br>" : ""}
    ${settings.business_phone ? esc(settings.business_phone) + "<br>" : ""}
    Receipt #${sale.id} · ${esc(dateLabel)}
  </div>
  <table>
    ${lineRows}
    <tr class="divider"><td>Subtotal</td><td class="amt">${
    fmt(sale.subtotal_cents)
  }</td></tr>
    <tr><td>Tax</td><td class="amt">${fmt(sale.tax_cents)}</td></tr>
    <tr class="spacer"><td colspan="2"></td></tr>
    <tr class="total-row"><td>TOTAL</td><td class="amt">${
    fmt(sale.total_cents)
  }</td></tr>
    <tr class="spacer"><td colspan="2"></td></tr>
    ${payRows}
  </table>
  <div class="foot">${esc(footer)}</div>
</div></body></html>`;
}
