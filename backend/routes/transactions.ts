// routes/transactions.ts — sales, day listing, dashboard, receipt.
import { Hono } from "hono";
import type { Db, LineInput, PaymentType, Range } from "../db.ts";
import { localDateString } from "../db.ts";
import { renderCloseout, renderReceipt } from "../receipt.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayParam(value: string | undefined | null): string {
  if (!value || value === "today") return localDateString();
  return DATE_RE.test(value) ? value : localDateString();
}

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function csv(headers: string[], rows: unknown[][]): string {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((r) => r.map(csvCell).join(",")),
  ].join("\n") + "\n";
}

function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

export function transactionRoutes(db: Db): Hono {
  const app = new Hono();

  app.post("/sales", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const items: LineInput[] = Array.isArray(b.items)
      ? b.items.map((it: Record<string, unknown>) => ({
        name: String(it.name ?? "Item"),
        unit_price_cents: Math.round(Number(it.unit_price_cents)),
        qty: Math.max(1, Math.round(Number(it.qty ?? 1))),
      }))
      : [];
    if (items.length === 0) return c.json({ error: "items required" }, 400);
    if (items.some((it) => !Number.isFinite(it.unit_price_cents))) {
      return c.json({ error: "invalid unit_price_cents" }, 400);
    }

    const payment_type: PaymentType = b.payment_type === "card"
      ? "card"
      : "cash";
    const cash_tendered_cents = b.cash_tendered_cents != null
      ? Math.round(Number(b.cash_tendered_cents))
      : null;

    try {
      const sale = db.createSale({ items, payment_type, cash_tendered_cents });
      return c.json({ ...sale, lines: db.getSaleLines(sale.id) }, 201);
    } catch (e) {
      return c.json({ error: String((e as Error).message) }, 400);
    }
  });

  app.get("/sales", (c) => {
    const day = dayParam(c.req.query("date"));
    return c.json(db.listSalesForDay(day));
  });

  app.get("/sales/dashboard", (c) => {
    const r = c.req.query("range");
    const range: Range = r === "7d" || r === "30d" ? r : "today";
    return c.json(db.dashboard(range));
  });

  app.get("/sales/closeout", (c) => {
    const day = dayParam(c.req.query("date"));
    return c.json(db.closeout(day));
  });

  app.get("/sales/closeout/print", (c) => {
    const day = dayParam(c.req.query("date"));
    return c.html(renderCloseout(db, day));
  });

  app.get("/sales/export", (c) => {
    const from = dayParam(c.req.query("from"));
    const to = dayParam(c.req.query("to") ?? c.req.query("from"));
    const type = c.req.query("type") === "lines" ? "lines" : "sales";

    if (type === "lines") {
      const rows = db.exportSaleLines(from, to);
      const body = csv(
        [
          "sale_id",
          "sale_date",
          "created_at",
          "sale_status",
          "payment_type",
          "item_name",
          "unit_price_cents",
          "qty",
          "line_total_cents",
        ],
        rows.map((r) => [
          r.sale_id,
          r.sale_date,
          r.created_at,
          r.sale_status,
          r.payment_type,
          r.item_name,
          r.unit_price_cents,
          r.qty,
          r.line_total_cents,
        ]),
      );
      return csvResponse(body, `k-saloon-line-items-${from}-to-${to}.csv`);
    }

    const rows = db.exportSales(from, to);
    const body = csv(
      [
        "id",
        "sale_date",
        "created_at",
        "status",
        "payment_type",
        "item_count",
        "subtotal_cents",
        "tax_cents",
        "total_cents",
        "cash_tendered_cents",
        "change_cents",
        "voided_at",
        "void_reason",
      ],
      rows.map((r) => [
        r.id,
        r.sale_date,
        r.created_at,
        r.status,
        r.payment_type,
        r.item_count,
        r.subtotal_cents,
        r.tax_cents,
        r.total_cents,
        r.cash_tendered_cents,
        r.change_cents,
        r.voided_at,
        r.void_reason,
      ]),
    );
    return csvResponse(body, `k-saloon-sales-${from}-to-${to}.csv`);
  });

  app.get("/sales/:id", (c) => {
    const id = Number(c.req.param("id"));
    const sale = db.getSaleWithLines(id);
    if (!sale) return c.json({ error: "not found" }, 404);
    return c.json(sale);
  });

  app.post("/sales/:id/void", async (c) => {
    const id = Number(c.req.param("id"));
    const b = await c.req.json().catch(() => ({}));
    const reason = String(b.reason ?? "").trim();
    const sale = db.voidSale(id, reason);
    if (!sale) return c.json({ error: "not found" }, 404);
    return c.json({ ...sale, lines: db.getSaleLines(id) });
  });

  app.get("/sales/:id/receipt", (c) => {
    const id = Number(c.req.param("id"));
    const sale = db.getSale(id);
    if (!sale) return c.json({ error: "not found" }, 404);
    return c.html(renderReceipt(db, sale));
  });

  return app;
}
