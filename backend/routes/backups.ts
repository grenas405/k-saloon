// routes/backups.ts — local backup metadata and manual snapshots.
import { Hono } from "hono";
import type { Db } from "../db.ts";

export function backupRoutes(db: Db): Hono {
  const app = new Hono();

  app.get("/backups", (c) => c.json(db.backupInfo()));

  app.post("/backups", (c) => {
    const path = db.backupNow();
    if (!path) return c.json({ error: "backup unavailable" }, 400);
    return c.json({ ok: true, path, info: db.backupInfo() }, 201);
  });

  return app;
}
