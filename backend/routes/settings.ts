// routes/settings.ts — read/update the allowed settings keys.
import { Hono } from "hono";
import type { Db } from "../db.ts";

const ALLOWED = new Set([
  "business_name",
  "business_address",
  "business_phone",
  "tax_rate",
  "receipt_footer",
]);

export function settingsRoutes(db: Db): Hono {
  const app = new Hono();

  app.get("/settings", (c) => c.json(db.getSettings()));

  app.put("/settings", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    for (const [k, v] of Object.entries(b)) {
      if (!ALLOWED.has(k)) continue;
      if (k === "tax_rate") {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 1) {
          return c.json({ error: "tax_rate must be a fraction in [0,1]" }, 400);
        }
        db.setSetting(k, String(n));
      } else {
        db.setSetting(k, String(v));
      }
    }
    return c.json(db.getSettings());
  });

  return app;
}
