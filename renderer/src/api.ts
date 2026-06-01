// api.ts — fetch wrapper around the loopback backend + money helpers.
import type {
  CatalogItem,
  Dashboard,
  DayReport,
  Sale,
  Settings,
} from "./types";

/** Resolve the backend base URL: preload bridge, injected global, or ?port=. */
function resolveBase(): string {
  if (window.app?.backendBaseUrl) return window.app.backendBaseUrl;
  if (window.__BACKEND_BASE__) return window.__BACKEND_BASE__;
  const port = new URLSearchParams(window.location.search).get("port");
  if (port) return `http://127.0.0.1:${port}`;
  // Vite dev fallback: backend started separately on a known port.
  return "http://127.0.0.1:8799";
}

const BASE = resolveBase();

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${msg}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  base: BASE,
  health: () => req<{ ok: boolean }>("/health"),

  getCatalog: (all = false) => req<CatalogItem[]>(`/catalog${all ? "?all=1" : ""}`),
  createItem: (body: Partial<CatalogItem>) =>
    req<CatalogItem>("/catalog", { method: "POST", body: JSON.stringify(body) }),
  updateItem: (id: number, body: Partial<CatalogItem>) =>
    req<CatalogItem>(`/catalog/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteItem: (id: number, permanent = false) =>
    req<{ ok: boolean }>(`/catalog/${id}${permanent ? "?permanent=1" : ""}`, {
      method: "DELETE",
    }),

  getSettings: () => req<Settings>("/settings"),
  updateSettings: (body: Settings) =>
    req<Settings>("/settings", { method: "PUT", body: JSON.stringify(body) }),

  createSale: (body: {
    items: Array<{ name: string; unit_price_cents: number; qty: number }>;
    payment_type: "cash" | "card";
    cash_tendered_cents?: number | null;
  }) => req<Sale>("/sales", { method: "POST", body: JSON.stringify(body) }),
  getDay: (date = "today") => req<DayReport>(`/sales?date=${date}`),
  getDashboard: (range: "today" | "7d" | "30d") =>
    req<Dashboard>(`/sales/dashboard?range=${range}`),
  receiptUrl: (id: number) => `${BASE}/sales/${id}/receipt`,
  getReceiptHtml: (id: number) =>
    fetch(`${BASE}/sales/${id}/receipt`).then((r) => r.text()),
};

// --- money helpers ----------------------------------------------------------

export function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** Parse a dollar string ("12.50", "$12.50") into integer cents. */
export function parseDollars(input: string): number {
  const n = Number(String(input).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
