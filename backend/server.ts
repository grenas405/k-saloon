// server.ts — Hono app bound strictly to 127.0.0.1 (loopback only).
//
// The Electron launcher passes POS_PORT (free ephemeral port) and POS_DB_PATH
// via env. createApp(db) is exported so tests can mount the same app in-memory.
import { Hono } from "hono";
import { Db } from "./db.ts";
import { catalogRoutes } from "./routes/catalog.ts";
import { transactionRoutes } from "./routes/transactions.ts";
import { settingsRoutes } from "./routes/settings.ts";
import { backupRoutes } from "./routes/backups.ts";

export function createApp(db: Db): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true, status: "ready" }));

  app.route("/", catalogRoutes(db));
  app.route("/", transactionRoutes(db));
  app.route("/", settingsRoutes(db));
  app.route("/", backupRoutes(db));

  return app;
}

// Only start a listener when run directly (not when imported by tests).
if (import.meta.main) {
  const dbPath = Deno.env.get("POS_DB_PATH") ?? "pos.db";
  const port = Number(Deno.env.get("POS_PORT") ?? "0");

  const db = new Db(dbPath);
  db.backupDaily(); // best-effort; never blocks startup

  const app = createApp(db);

  const server = Deno.serve(
    { hostname: "127.0.0.1", port },
    app.fetch,
  );

  // Report the actual bound port (useful when port=0 picks an ephemeral one).
  console.log(
    `k-saloon-backend listening on http://127.0.0.1:${server.addr.port}`,
  );
}
