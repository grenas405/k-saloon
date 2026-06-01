// db.ts — node:sqlite persistence for K Saloon POS.
//
// Domain-agnostic POS core. K Saloon customization is confined to seed() below.
// Honors the reference constraints: integer-cent money, server-side totals,
// local-day grouping, additive/idempotent migrations, and checkpoint+copy backups.
import { DatabaseSync } from "node:sqlite";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Domain pack (bar/saloon) — the ONLY business-specific block in the core.
// ---------------------------------------------------------------------------
const BACKUP_PREFIX = "k-saloon";

const SEED_SETTINGS: Record<string, string> = {
  business_name: "K Saloon",
  business_address: "3711 S High Ave, Oklahoma City, OK 73129",
  business_phone: "(405) 635-9067",
  // Oklahoma City combined sales tax (state 4.5% + city 4.125%).
  tax_rate: "0.08625",
  receipt_footer: "Thank you for visiting K Saloon!\nPlease come again.",
};

const SEED_CATALOG: Array<
  { name: string; category: string; price_cents: number; color?: string }
> = [
  {
    name: "Domestic Beer",
    category: "Beer",
    price_cents: 400,
    color: "#d97706",
  },
  { name: "Import Beer", category: "Beer", price_cents: 500, color: "#b45309" },
  {
    name: "Well Drink",
    category: "Cocktails",
    price_cents: 550,
    color: "#dc2626",
  },
  {
    name: "Call Drink",
    category: "Cocktails",
    price_cents: 650,
    color: "#991b1b",
  },
  { name: "House Shot", category: "Shots", price_cents: 450, color: "#7f1d1d" },
  {
    name: "Glass of Wine",
    category: "Wine",
    price_cents: 600,
    color: "#9f1239",
  },
  { name: "Soda", category: "Non-Alcohol", price_cents: 250, color: "#0f766e" },
  { name: "Snack", category: "Snacks", price_cents: 300, color: "#65a30d" },
  {
    name: "Pool Table",
    category: "Pool & Games",
    price_cents: 100,
    color: "#1d4ed8",
  },
  {
    name: "Cover Charge",
    category: "Fees",
    price_cents: 500,
    color: "#475569",
  },
];

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests).
// ---------------------------------------------------------------------------

export interface LineInput {
  name: string;
  unit_price_cents: number;
  qty: number;
}

export interface Totals {
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
}

/** Recompute money totals from line items + tax rate. Integer cents only. */
export function computeTotals(items: LineInput[], taxRate: number): Totals {
  const subtotal_cents = items.reduce(
    (sum, it) => sum + Math.round(it.unit_price_cents) * Math.round(it.qty),
    0,
  );
  const tax_cents = Math.round(subtotal_cents * taxRate);
  return { subtotal_cents, tax_cents, total_cents: subtotal_cents + tax_cents };
}

/** Local calendar date as YYYY-MM-DD (NOT the UTC slice of an ISO string). */
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Subtract n days from a YYYY-MM-DD string, returning YYYY-MM-DD (local). */
export function dateMinusDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - n);
  return localDateString(dt);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentType = "cash" | "card";

export interface CatalogItem {
  id: number;
  name: string;
  category: string;
  price_cents: number;
  active: number;
  color: string | null;
  description: string | null;
}

export interface SaleInput {
  items: LineInput[];
  payment_type: PaymentType;
  cash_tendered_cents?: number | null;
}

export interface Sale {
  id: number;
  created_at: string;
  sale_date: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  payment_type: PaymentType;
  cash_tendered_cents: number | null;
  change_cents: number | null;
}

export type Range = "today" | "7d" | "30d";

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export class Db {
  readonly raw: DatabaseSync;
  readonly path: string;

  constructor(path = ":memory:") {
    this.path = path;
    this.raw = new DatabaseSync(path);
    this.raw.exec("PRAGMA foreign_keys = ON");
    if (path !== ":memory:") {
      this.raw.exec("PRAGMA journal_mode = WAL");
    }
    this.migrate();
    this.seed();
  }

  // --- schema + additive migrations -----------------------------------------

  private migrate(): void {
    this.raw.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS catalog_items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        category    TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        active      INTEGER NOT NULL DEFAULT 1,
        color       TEXT,
        description TEXT
      );
      CREATE TABLE IF NOT EXISTS sales (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at          TEXT NOT NULL,
        sale_date           TEXT NOT NULL,
        subtotal_cents      INTEGER NOT NULL,
        tax_cents           INTEGER NOT NULL,
        total_cents         INTEGER NOT NULL,
        payment_type        TEXT NOT NULL,
        cash_tendered_cents INTEGER,
        change_cents        INTEGER
      );
      CREATE TABLE IF NOT EXISTS sale_line_items (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id          INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        name             TEXT NOT NULL,
        unit_price_cents INTEGER NOT NULL,
        qty              INTEGER NOT NULL,
        line_total_cents INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
      CREATE INDEX IF NOT EXISTS idx_lines_sale_id ON sale_line_items(sale_id);
    `);
    // Future-proofing: additive columns go through addColumnIfMissing so an old
    // installed DB upgrades in place without dropping live business data.
  }

  /** Idempotently add a column if PRAGMA table_info shows it missing. */
  addColumnIfMissing(table: string, col: string, type: string): void {
    const cols = this.raw.prepare(`PRAGMA table_info(${table})`).all() as Array<
      { name: string }
    >;
    if (!cols.some((c) => c.name === col)) {
      this.raw.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    }
  }

  // --- seed (domain pack) ----------------------------------------------------

  private seed(): void {
    const haveSettings =
      (this.raw.prepare("SELECT COUNT(*) AS n FROM settings").get() as {
        n: number;
      }).n;
    if (haveSettings === 0) {
      const ins = this.raw.prepare(
        "INSERT INTO settings(key, value) VALUES (?, ?)",
      );
      for (const [k, v] of Object.entries(SEED_SETTINGS)) ins.run(k, v);
    }

    const haveCatalog =
      (this.raw.prepare("SELECT COUNT(*) AS n FROM catalog_items").get() as {
        n: number;
      }).n;
    if (haveCatalog === 0) {
      const ins = this.raw.prepare(
        `INSERT INTO catalog_items(name, category, price_cents, active, color, description)
         VALUES (?, ?, ?, 1, ?, NULL)`,
      );
      for (const it of SEED_CATALOG) {
        ins.run(it.name, it.category, it.price_cents, it.color ?? null);
      }
    }
  }

  // --- settings --------------------------------------------------------------

  getSettings(): Record<string, string> {
    const rows = this.raw.prepare("SELECT key, value FROM settings")
      .all() as Array<
        { key: string; value: string }
      >;
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  setSetting(key: string, value: string): void {
    this.raw
      .prepare(
        `INSERT INTO settings(key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  getTaxRate(): number {
    const r = this.raw.prepare(
      "SELECT value FROM settings WHERE key='tax_rate'",
    )
      .get() as { value: string } | undefined;
    const n = r ? Number(r.value) : 0;
    return Number.isFinite(n) ? n : 0;
  }

  // --- catalog CRUD ----------------------------------------------------------

  listCatalog(all = false): CatalogItem[] {
    const sql = all
      ? "SELECT * FROM catalog_items ORDER BY category, name"
      : "SELECT * FROM catalog_items WHERE active=1 ORDER BY category, name";
    return this.raw.prepare(sql).all() as unknown as CatalogItem[];
  }

  createCatalogItem(
    p: {
      name: string;
      category: string;
      price_cents: number;
      color?: string | null;
      description?: string | null;
    },
  ): CatalogItem {
    const r = this.raw
      .prepare(
        `INSERT INTO catalog_items(name, category, price_cents, active, color, description)
         VALUES (?, ?, ?, 1, ?, ?)`,
      )
      .run(
        p.name,
        p.category,
        Math.round(p.price_cents),
        p.color ?? null,
        p.description ?? null,
      );
    return this.getCatalogItem(Number(r.lastInsertRowid))!;
  }

  getCatalogItem(id: number): CatalogItem | undefined {
    return this.raw.prepare("SELECT * FROM catalog_items WHERE id=?").get(id) as
      | CatalogItem
      | undefined;
  }

  updateCatalogItem(
    id: number,
    p: Partial<{
      name: string;
      category: string;
      price_cents: number;
      active: number;
      color: string | null;
      description: string | null;
    }>,
  ): CatalogItem | undefined {
    const fields: string[] = [];
    const vals: Array<string | number | null> = [];
    for (
      const key of [
        "name",
        "category",
        "price_cents",
        "active",
        "color",
        "description",
      ] as const
    ) {
      if (p[key] !== undefined) {
        fields.push(`${key} = ?`);
        vals.push(p[key] as string | number | null);
      }
    }
    if (fields.length > 0) {
      vals.push(id);
      this.raw.prepare(
        `UPDATE catalog_items SET ${fields.join(", ")} WHERE id=?`,
      ).run(...vals);
    }
    return this.getCatalogItem(id);
  }

  /** Soft-hide (active=0) by default; permanent removes the row. */
  deleteCatalogItem(id: number, permanent = false): void {
    if (permanent) {
      this.raw.prepare("DELETE FROM catalog_items WHERE id=?").run(id);
    } else {
      this.raw.prepare("UPDATE catalog_items SET active=0 WHERE id=?").run(id);
    }
  }

  // --- sales -----------------------------------------------------------------

  /** Create a transaction. Totals are recomputed server-side from the stored
   *  tax rate; client-sent totals are ignored. Line items snapshot name/price. */
  createSale(input: SaleInput): Sale {
    if (!input.items || input.items.length === 0) {
      throw new Error("sale requires at least one line item");
    }
    const taxRate = this.getTaxRate();
    const totals = computeTotals(input.items, taxRate);

    const now = new Date();
    const created_at = now.toISOString();
    const sale_date = localDateString(now);

    const payment_type: PaymentType = input.payment_type === "card"
      ? "card"
      : "cash";
    const cash_tendered_cents = payment_type === "cash"
      ? (input.cash_tendered_cents ?? null)
      : null;
    const change_cents = payment_type === "cash" && cash_tendered_cents != null
      ? Math.max(0, cash_tendered_cents - totals.total_cents)
      : null;

    this.raw.exec("BEGIN");
    try {
      const saleRes = this.raw
        .prepare(
          `INSERT INTO sales(created_at, sale_date, subtotal_cents, tax_cents, total_cents,
                             payment_type, cash_tendered_cents, change_cents)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          created_at,
          sale_date,
          totals.subtotal_cents,
          totals.tax_cents,
          totals.total_cents,
          payment_type,
          cash_tendered_cents,
          change_cents,
        );
      const saleId = Number(saleRes.lastInsertRowid);

      const insLine = this.raw.prepare(
        `INSERT INTO sale_line_items(sale_id, name, unit_price_cents, qty, line_total_cents)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const it of input.items) {
        const unit = Math.round(it.unit_price_cents);
        const qty = Math.round(it.qty);
        insLine.run(saleId, it.name, unit, qty, unit * qty);
      }
      this.raw.exec("COMMIT");
      return this.getSale(saleId)!;
    } catch (e) {
      this.raw.exec("ROLLBACK");
      throw e;
    }
  }

  getSale(id: number): Sale | undefined {
    return this.raw.prepare("SELECT * FROM sales WHERE id=?").get(id) as
      | Sale
      | undefined;
  }

  getSaleLines(saleId: number): Array<
    {
      id: number;
      name: string;
      unit_price_cents: number;
      qty: number;
      line_total_cents: number;
    }
  > {
    return this.raw
      .prepare(
        "SELECT id, name, unit_price_cents, qty, line_total_cents FROM sale_line_items WHERE sale_id=? ORDER BY id",
      )
      .all(saleId) as Array<
        {
          id: number;
          name: string;
          unit_price_cents: number;
          qty: number;
          line_total_cents: number;
        }
      >;
  }

  /** Sales for one local day plus cash/card split. */
  listSalesForDay(day: string): {
    sales: Array<Sale & { item_count: number }>;
    cash_total_cents: number;
    card_total_cents: number;
    total_cents: number;
    count: number;
  } {
    const sales = this.raw
      .prepare(
        `SELECT s.*, COALESCE(SUM(li.qty), 0) AS item_count
         FROM sales s
         LEFT JOIN sale_line_items li ON li.sale_id = s.id
         WHERE s.sale_date = ?
         GROUP BY s.id
         ORDER BY s.created_at DESC`,
      )
      .all(day) as unknown as Array<Sale & { item_count: number }>;

    let cash = 0, card = 0;
    for (const s of sales) {
      if (s.payment_type === "cash") cash += s.total_cents;
      else card += s.total_cents;
    }
    return {
      sales,
      cash_total_cents: cash,
      card_total_cents: card,
      total_cents: cash + card,
      count: sales.length,
    };
  }

  // --- dashboard -------------------------------------------------------------

  private windowKpis(start: string, end: string): {
    revenue_cents: number;
    count: number;
    items_sold: number;
    avg_ticket_cents: number;
  } {
    const agg = this.raw
      .prepare(
        `SELECT COALESCE(SUM(total_cents),0) AS revenue, COUNT(*) AS cnt
         FROM sales WHERE sale_date >= ? AND sale_date <= ?`,
      )
      .get(start, end) as { revenue: number; cnt: number };
    const items = this.raw
      .prepare(
        `SELECT COALESCE(SUM(li.qty),0) AS items
         FROM sale_line_items li JOIN sales s ON s.id = li.sale_id
         WHERE s.sale_date >= ? AND s.sale_date <= ?`,
      )
      .get(start, end) as { items: number };
    const count = agg.cnt;
    return {
      revenue_cents: agg.revenue,
      count,
      items_sold: items.items,
      avg_ticket_cents: count > 0 ? Math.round(agg.revenue / count) : 0,
    };
  }

  dashboard(range: Range, today: string = localDateString()) {
    const rangeDays = range === "today" ? 1 : range === "7d" ? 7 : 30;
    const seriesDays = range === "today" ? 7 : rangeDays;

    const start = dateMinusDays(today, rangeDays - 1);
    const current = this.windowKpis(start, today);

    const prevEnd = dateMinusDays(start, 1);
    const prevStart = dateMinusDays(start, rangeDays);
    const previous = this.windowKpis(prevStart, prevEnd);

    // Daily revenue series (oldest -> newest), zero-filled.
    const seriesStart = dateMinusDays(today, seriesDays - 1);
    const rows = this.raw
      .prepare(
        `SELECT sale_date, SUM(total_cents) AS revenue
         FROM sales WHERE sale_date >= ? AND sale_date <= ?
         GROUP BY sale_date`,
      )
      .all(seriesStart, today) as Array<{ sale_date: string; revenue: number }>;
    const byDate = new Map(rows.map((r) => [r.sale_date, r.revenue]));
    const series: Array<{ date: string; revenue_cents: number }> = [];
    for (let i = seriesDays - 1; i >= 0; i--) {
      const d = dateMinusDays(today, i);
      series.push({ date: d, revenue_cents: byDate.get(d) ?? 0 });
    }

    // Cash/card mix over the current window.
    const mixRows = this.raw
      .prepare(
        `SELECT payment_type, COALESCE(SUM(total_cents),0) AS amount
         FROM sales WHERE sale_date >= ? AND sale_date <= ?
         GROUP BY payment_type`,
      )
      .all(start, today) as Array<
        { payment_type: PaymentType; amount: number }
      >;
    let cash = 0, card = 0;
    for (const m of mixRows) {
      if (m.payment_type === "cash") cash = m.amount;
      else if (m.payment_type === "card") card = m.amount;
    }

    const recent = this.raw
      .prepare(
        `SELECT s.id, s.created_at, s.total_cents, s.payment_type,
                COALESCE(SUM(li.qty),0) AS item_count
         FROM sales s LEFT JOIN sale_line_items li ON li.sale_id = s.id
         GROUP BY s.id ORDER BY s.created_at DESC LIMIT 10`,
      )
      .all() as Array<
        {
          id: number;
          created_at: string;
          total_cents: number;
          payment_type: PaymentType;
          item_count: number;
        }
      >;

    return {
      range,
      current,
      previous,
      series,
      payment_mix: { cash_cents: cash, card_cents: card },
      recent,
    };
  }

  // --- backups ---------------------------------------------------------------

  /** Consistent daily snapshot via checkpoint+copy (node:sqlite has no
   *  VACUUM INTO). One snapshot per local day; retain newest ~14. Never throws. */
  backupDaily(retain = 14): string | null {
    if (this.path === ":memory:") return null;
    try {
      const dir = join(dirname(this.path), "backups");
      mkdirSync(dir, { recursive: true });
      const dest = join(dir, `${BACKUP_PREFIX}-${localDateString()}.db`);
      if (existsSync(dest)) return dest; // already snapshotted today

      this.raw.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      copyFileSync(this.path, dest);

      // Prune: keep newest `retain` snapshots.
      const snaps = readdirSync(dir)
        .filter((f) => f.startsWith(`${BACKUP_PREFIX}-`) && f.endsWith(".db"))
        .sort();
      for (const old of snaps.slice(0, Math.max(0, snaps.length - retain))) {
        try {
          unlinkSync(join(dir, old));
        } catch { /* ignore */ }
      }
      return dest;
    } catch {
      return null; // never block startup on backup failure
    }
  }

  close(): void {
    this.raw.close();
  }
}
