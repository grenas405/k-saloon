// receipt.ts — printable, brand-accented receipt/report HTML (print or save-PDF).
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
  const isVoid = sale.status === "void";

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
  .void {
    margin: 8px 0 10px; border: 2px solid #991b1b; color: #991b1b;
    border-radius: 8px; padding: 6px; text-align: center; font-weight: 900;
    letter-spacing: 0.08em;
  }
  .void-note { font-size: 10px; letter-spacing: 0; font-weight: 600; color: #7f1d1d; }
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
  ${
    isVoid
      ? `<div class="void">VOID<div class="void-note">${
        sale.void_reason ? esc(sale.void_reason) : "Voided transaction"
      }</div></div>`
      : ""
  }
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

export function renderCloseout(db: Db, day: string): string {
  const settings = db.getSettings();
  const name = settings.business_name || "K Saloon";
  const report = db.closeout(day);
  const daySales = db.listSalesForDay(day).sales;
  const generatedAt = new Date().toLocaleString();

  const topRows = report.top_items.length === 0
    ? `<tr><td colspan="3" class="muted">No items sold.</td></tr>`
    : report.top_items.map((it) =>
      `<tr><td>${
        esc(it.name)
      }</td><td class="num">${it.qty}</td><td class="num">${
        fmt(it.total_cents)
      }</td></tr>`
    ).join("");

  const saleRows = daySales.length === 0
    ? `<tr><td colspan="5" class="muted">No tickets for this day.</td></tr>`
    : daySales.map((s) => {
      const time = new Date(s.created_at).toLocaleTimeString();
      const status = s.status === "void" ? "VOID" : "PAID";
      return `<tr class="${s.status === "void" ? "void-row" : ""}">
        <td>#${s.id}</td>
        <td>${esc(time)}</td>
        <td>${status}</td>
        <td>${esc(s.payment_type)}</td>
        <td class="num">${fmt(s.total_cents)}</td>
      </tr>`;
    }).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Closeout ${esc(day)}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0; padding: 28px; color: #111;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-variant-numeric: tabular-nums;
  }
  @page { margin: 14mm; }
  .sheet { max-width: 760px; margin: 0 auto; }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-bottom: 4px solid ${BRAND}; padding-bottom: 14px; }
  .logo { width: 150px; height: auto; }
  h1 { margin: 0; font-size: 26px; }
  .muted { color: #64748b; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
  .label { color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 800; }
  .value { margin-top: 4px; font-size: 20px; font-weight: 900; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  th { text-align: left; color: #64748b; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding: 8px 6px; }
  td { border-bottom: 1px solid #e2e8f0; padding: 8px 6px; }
  .num { text-align: right; }
  .section { margin-top: 22px; }
  .section h2 { margin: 0; font-size: 16px; }
  .summary { max-width: 380px; margin-left: auto; }
  .summary td { border-bottom: none; padding: 4px 0; }
  .summary .grand td { border-top: 2px solid ${BRAND}; padding-top: 8px; font-weight: 900; font-size: 18px; }
  .void-row { color: #991b1b; text-decoration: line-through; }
</style></head>
<body><div class="sheet">
  <div class="header">
    <div>
      <h1>${esc(name)} Closeout</h1>
      <div class="muted">${esc(day)} · Generated ${esc(generatedAt)}</div>
    </div>
    <img class="logo" src="${LOGO_DATA_URI}" alt="${esc(name)}" />
  </div>

  <div class="grid">
    <div class="kpi"><div class="label">Revenue</div><div class="value">${
    fmt(report.revenue_cents)
  }</div></div>
    <div class="kpi"><div class="label">Paid Tickets</div><div class="value">${report.paid_count}</div></div>
    <div class="kpi"><div class="label">Items Sold</div><div class="value">${report.item_count}</div></div>
    <div class="kpi"><div class="label">Voids</div><div class="value">${report.void_count}</div></div>
  </div>

  <table class="summary">
    <tr><td>Subtotal</td><td class="num">${fmt(report.subtotal_cents)}</td></tr>
    <tr><td>Tax</td><td class="num">${fmt(report.tax_cents)}</td></tr>
    <tr><td>Cash</td><td class="num">${fmt(report.cash_cents)}</td></tr>
    <tr><td>Card</td><td class="num">${fmt(report.card_cents)}</td></tr>
    <tr><td>Voided Total</td><td class="num">${
    fmt(report.void_total_cents)
  }</td></tr>
    <tr class="grand"><td>Total Revenue</td><td class="num">${
    fmt(report.revenue_cents)
  }</td></tr>
  </table>

  <div class="section">
    <h2>Top Items</h2>
    <table>
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Total</th></tr></thead>
      <tbody>${topRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Tickets</h2>
    <table>
      <thead><tr><th>Ticket</th><th>Time</th><th>Status</th><th>Payment</th><th class="num">Total</th></tr></thead>
      <tbody>${saleRows}</tbody>
    </table>
  </div>
</div></body></html>`;
}
