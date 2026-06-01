// server_test.ts — covers instructions.json verification.backend.
import { assert, assertEquals, assertExists } from "@std/assert";
import { computeTotals, dateMinusDays, Db, localDateString } from "./db.ts";
import { createApp } from "./server.ts";
import { renderReceipt } from "./receipt.ts";

function freshDb(): Db {
  return new Db(":memory:");
}

// --- money math + server-side recompute -------------------------------------

Deno.test("computeTotals: integer-cent tax math", () => {
  const t = computeTotals(
    [{ name: "x", unit_price_cents: 4500, qty: 1 }],
    0.08625,
  );
  assertEquals(t.subtotal_cents, 4500);
  assertEquals(t.tax_cents, 388); // round(4500 * 0.08625) = round(388.125)
  assertEquals(t.total_cents, 4888);
});

Deno.test("computeTotals: qty and multiple lines", () => {
  const t = computeTotals(
    [
      { name: "a", unit_price_cents: 3000, qty: 2 },
      { name: "b", unit_price_cents: 2200, qty: 1 },
    ],
    0.08625,
  );
  assertEquals(t.subtotal_cents, 8200);
  assertEquals(t.tax_cents, 707); // round(707.25)
  assertEquals(t.total_cents, 8907);
});

Deno.test("createSale: server recomputes totals; ignores nothing from client", () => {
  const db = freshDb();
  const sale = db.createSale({
    items: [{ name: "Domestic Beer", unit_price_cents: 400, qty: 1 }],
    payment_type: "card",
  });
  assertEquals(sale.subtotal_cents, 400);
  assertEquals(sale.tax_cents, 35);
  assertEquals(sale.total_cents, 435);
  assertEquals(sale.change_cents, null);
  assertEquals(sale.cash_tendered_cents, null);
  db.close();
});

Deno.test("createSale: cash change-due", () => {
  const db = freshDb();
  const sale = db.createSale({
    items: [{ name: "Import Beer", unit_price_cents: 500, qty: 1 }],
    payment_type: "cash",
    cash_tendered_cents: 5000,
  });
  assertEquals(sale.total_cents, 543);
  assertEquals(sale.change_cents, 4457);
  db.close();
});

Deno.test("configurable tax rate is honored", () => {
  const db = freshDb();
  db.setSetting("tax_rate", "0");
  const sale = db.createSale({
    items: [{ name: "x", unit_price_cents: 1000, qty: 1 }],
    payment_type: "card",
  });
  assertEquals(sale.tax_cents, 0);
  assertEquals(sale.total_cents, 1000);
  db.close();
});

// --- catalog soft-delete vs permanent ---------------------------------------

Deno.test("catalog soft-delete hides but keeps row; permanent removes", () => {
  const db = freshDb();
  const item = db.createCatalogItem({
    name: "Temp",
    category: "Fees",
    price_cents: 500,
  });
  db.deleteCatalogItem(item.id, false);
  assert(
    !db.listCatalog(false).some((i) => i.id === item.id),
    "hidden from active list",
  );
  assert(
    db.listCatalog(true).some((i) => i.id === item.id),
    "still present in all list",
  );
  assertEquals(db.getCatalogItem(item.id)!.active, 0);

  db.deleteCatalogItem(item.id, true);
  assertEquals(db.getCatalogItem(item.id), undefined);
  db.close();
});

Deno.test("line items snapshot name/price; editing catalog never alters history", () => {
  const db = freshDb();
  const item = db.createCatalogItem({
    name: "Premium Whiskey",
    category: "Shots",
    price_cents: 900,
  });
  const sale = db.createSale({
    items: [{ name: item.name, unit_price_cents: item.price_cents, qty: 1 }],
    payment_type: "card",
  });
  db.updateCatalogItem(item.id, {
    name: "Premium Whiskey Double",
    price_cents: 1400,
  });
  const lines = db.getSaleLines(sale.id);
  assertEquals(lines[0].name, "Premium Whiskey");
  assertEquals(lines[0].unit_price_cents, 900);
  db.close();
});

// --- local-day grouping ------------------------------------------------------

Deno.test("sale_date set to local day; listSalesForDay returns it", () => {
  const db = freshDb();
  const today = localDateString();
  db.createSale({
    items: [{ name: "x", unit_price_cents: 1000, qty: 1 }],
    payment_type: "cash",
    cash_tendered_cents: 2000,
  });
  const day = db.listSalesForDay(today);
  assertEquals(day.count, 1);
  assertEquals(day.cash_total_cents, day.total_cents);
  assertEquals(day.sales[0].sale_date, today);
  // A different day has nothing.
  assertEquals(db.listSalesForDay(dateMinusDays(today, 5)).count, 0);
  db.close();
});

Deno.test("listSalesForDay splits cash vs card", () => {
  const db = freshDb();
  db.createSale({
    items: [{ name: "a", unit_price_cents: 1000, qty: 1 }],
    payment_type: "cash",
    cash_tendered_cents: 1100,
  });
  db.createSale({
    items: [{ name: "b", unit_price_cents: 2000, qty: 1 }],
    payment_type: "card",
  });
  const day = db.listSalesForDay(localDateString());
  assert(day.cash_total_cents > 0);
  assert(day.card_total_cents > 0);
  assertEquals(day.total_cents, day.cash_total_cents + day.card_total_cents);
  db.close();
});

// --- migrations add + backfill ----------------------------------------------

Deno.test("addColumnIfMissing adds + backfills on an old-schema DB", () => {
  const db = freshDb();
  db.addColumnIfMissing("sales", "tip_cents", "INTEGER NOT NULL DEFAULT 0");
  // Idempotent: calling twice does not throw.
  db.addColumnIfMissing("sales", "tip_cents", "INTEGER NOT NULL DEFAULT 0");
  const cols = db.raw.prepare("PRAGMA table_info(sales)").all() as Array<
    { name: string }
  >;
  assert(cols.some((c) => c.name === "tip_cents"));
  db.close();
});

// --- backups -----------------------------------------------------------------

Deno.test("backupDaily is a no-op for :memory:", () => {
  const db = freshDb();
  assertEquals(db.backupDaily(), null);
  db.close();
});

Deno.test("backupDaily writes one snapshot/day and prunes", async () => {
  const dir = await Deno.makeTempDir();
  const dbPath = `${dir}/pos.db`;
  const db = new Db(dbPath);
  const first = db.backupDaily();
  assertExists(first);
  assert(await fileExists(first!), "snapshot written");
  // Second call same day is a no-op returning the same path (one/day).
  const second = db.backupDaily();
  assertEquals(second, first);
  db.close();
  await Deno.remove(dir, { recursive: true });
});

async function fileExists(p: string): Promise<boolean> {
  try {
    await Deno.stat(p);
    return true;
  } catch {
    return false;
  }
}

// --- dashboard ---------------------------------------------------------------

Deno.test("dashboard: sums, series lengths, items_sold, avg_ticket", () => {
  const db = freshDb();
  db.createSale({
    items: [{ name: "a", unit_price_cents: 3000, qty: 2 }],
    payment_type: "card",
  });
  db.createSale({
    items: [{ name: "b", unit_price_cents: 1000, qty: 1 }],
    payment_type: "cash",
    cash_tendered_cents: 2000,
  });

  const today = db.dashboard("today");
  assertEquals(today.series.length, 7);
  assertEquals(today.current.count, 2);
  assertEquals(today.current.items_sold, 3);
  assert(today.current.revenue_cents > 0);
  assertEquals(
    today.current.avg_ticket_cents,
    Math.round(today.current.revenue_cents / 2),
  );

  assertEquals(db.dashboard("7d").series.length, 7);
  assertEquals(db.dashboard("30d").series.length, 30);
  db.close();
});

Deno.test("dashboard: empty range has no divide-by-zero", () => {
  const db = freshDb();
  const d = db.dashboard("30d");
  assertEquals(d.current.count, 0);
  assertEquals(d.current.revenue_cents, 0);
  assertEquals(d.current.avg_ticket_cents, 0);
  assertEquals(d.series.length, 30);
  db.close();
});

Deno.test("dashboard: prior-period window is the immediately preceding range", () => {
  const db = freshDb();
  const today = localDateString();
  // Insert a sale dated 8 days ago directly to land in the 7d prior window.
  const eightAgo = dateMinusDays(today, 8);
  db.raw.prepare(
    `INSERT INTO sales(created_at, sale_date, subtotal_cents, tax_cents, total_cents, payment_type, cash_tendered_cents, change_cents)
     VALUES (?, ?, ?, ?, ?, 'card', NULL, NULL)`,
  ).run(new Date().toISOString(), eightAgo, 5000, 0, 5000);
  const d = db.dashboard("7d");
  assertEquals(d.current.revenue_cents, 0);
  assertEquals(d.previous.revenue_cents, 5000);
  db.close();
});

// --- HTTP shapes -------------------------------------------------------------

Deno.test("HTTP: /health, POST /sales, GET /sales, GET /sales/dashboard", async () => {
  const db = freshDb();
  const app = createApp(db);

  const health = await app.request("/health");
  assertEquals(health.status, 200);
  assertEquals((await health.json()).ok, true);

  const post = await app.request("/sales", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      items: [{ name: "Domestic Beer", unit_price_cents: 400, qty: 1 }],
      payment_type: "cash",
      cash_tendered_cents: 5000,
    }),
  });
  assertEquals(post.status, 201);
  const sale = await post.json();
  assertEquals(sale.total_cents, 435);
  assertEquals(sale.change_cents, 4565);
  assert(Array.isArray(sale.lines));

  const list = await app.request("/sales?date=today");
  const day = await list.json();
  assertEquals(day.count, 1);
  assert("cash_total_cents" in day && "card_total_cents" in day);

  const dash = await (await app.request("/sales/dashboard?range=today")).json();
  assert(
    "current" in dash && "previous" in dash && "series" in dash &&
      "payment_mix" in dash,
  );
  assertEquals(dash.series.length, 7);

  const receipt = await app.request(`/sales/${sale.id}/receipt`);
  assertEquals(receipt.status, 200);
  assert((await receipt.text()).includes("TOTAL"));
  db.close();
});

Deno.test("renderReceipt: embeds logo data URI + editable footer", () => {
  const db = freshDb();
  db.setSetting("receipt_footer", "See you soon!\nK Saloon");
  const sale = db.createSale({
    items: [{ name: "Domestic Beer", unit_price_cents: 400, qty: 2 }],
    payment_type: "cash",
    cash_tendered_cents: 10000,
  });
  const html = renderReceipt(db, sale);
  assert(
    html.includes("data:image/svg+xml;base64,"),
    "logo embedded as data URI",
  );
  assert(html.includes("See you soon!"), "footer text rendered");
  assert(html.includes("K Saloon"), "footer second line rendered");
  assert(html.includes("TOTAL"), "total bar present");
  assert(html.includes("2 × $4.00"), "qty × unit subline present");
  db.close();
});

Deno.test("HTTP: settings accepts receipt_footer", async () => {
  const db = freshDb();
  const app = createApp(db);
  const res = await app.request("/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ receipt_footer: "Custom footer" }),
  });
  assertEquals(res.status, 200);
  assertEquals((await res.json()).receipt_footer, "Custom footer");
  db.close();
});

Deno.test("HTTP: settings validates tax_rate range", async () => {
  const db = freshDb();
  const app = createApp(db);
  const bad = await app.request("/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tax_rate: 1.5 }),
  });
  assertEquals(bad.status, 400);
  const good = await app.request("/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tax_rate: 0.05, business_phone: "405-555-0199" }),
  });
  assertEquals(good.status, 200);
  const s = await good.json();
  assertEquals(s.tax_rate, "0.05");
  assertEquals(s.business_phone, "405-555-0199");
  db.close();
});

Deno.test("HTTP: catalog CRUD + soft/permanent delete", async () => {
  const db = freshDb();
  const app = createApp(db);

  const created = await (await app.request("/catalog", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Karaoke Fee",
      category: "Fees",
      price_cents: 1500,
      color: "#000",
    }),
  })).json();
  assertEquals(created.name, "Karaoke Fee");

  await app.request(`/catalog/${created.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ price_cents: 1800, active: false }),
  });
  assertEquals(db.getCatalogItem(created.id)!.price_cents, 1800);
  assertEquals(db.getCatalogItem(created.id)!.active, 0);

  await app.request(`/catalog/${created.id}?permanent=1`, { method: "DELETE" });
  assertEquals(db.getCatalogItem(created.id), undefined);
  db.close();
});
