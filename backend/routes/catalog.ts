// routes/catalog.ts — catalog item CRUD.
import { Hono } from "hono";
import type { Db } from "../db.ts";

export function catalogRoutes(db: Db): Hono {
  const app = new Hono();

  app.get("/catalog", (c) => {
    const all = c.req.query("all") === "1";
    return c.json(db.listCatalog(all));
  });

  app.post("/catalog", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    if (!b.name || !b.category || !Number.isFinite(b.price_cents)) {
      return c.json({ error: "name, category, price_cents required" }, 400);
    }
    const item = db.createCatalogItem({
      name: String(b.name),
      category: String(b.category),
      price_cents: Math.round(Number(b.price_cents)),
      color: b.color ?? null,
      description: b.description ?? null,
    });
    return c.json(item, 201);
  });

  app.put("/catalog/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const b = await c.req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    for (
      const k of [
        "name",
        "category",
        "price_cents",
        "active",
        "color",
        "description",
      ]
    ) {
      if (b[k] !== undefined) patch[k] = b[k];
    }
    if (patch.price_cents !== undefined) {
      patch.price_cents = Math.round(Number(patch.price_cents));
    }
    if (patch.active !== undefined) patch.active = b.active ? 1 : 0;
    const item = db.updateCatalogItem(id, patch);
    if (!item) return c.json({ error: "not found" }, 404);
    return c.json(item);
  });

  app.delete("/catalog/:id", (c) => {
    const id = Number(c.req.param("id"));
    const permanent = c.req.query("permanent") === "1";
    db.deleteCatalogItem(id, permanent);
    return c.json({ ok: true, permanent });
  });

  return app;
}
