// routes/transactions.ts — sales, day listing, dashboard, receipt.
import { Hono } from "hono";
import type { Db, LineInput, PaymentType, Range } from "../db.ts";
import { localDateString } from "../db.ts";
import { renderReceipt } from "../receipt.ts";

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
    const dateParam = c.req.query("date");
    const day = !dateParam || dateParam === "today"
      ? localDateString()
      : dateParam;
    return c.json(db.listSalesForDay(day));
  });

  app.get("/sales/dashboard", (c) => {
    const r = c.req.query("range");
    const range: Range = r === "7d" || r === "30d" ? r : "today";
    return c.json(db.dashboard(range));
  });

  app.get("/sales/:id/receipt", (c) => {
    const id = Number(c.req.param("id"));
    const sale = db.getSale(id);
    if (!sale) return c.json({ error: "not found" }, 404);
    return c.html(renderReceipt(db, sale));
  });

  return app;
}
