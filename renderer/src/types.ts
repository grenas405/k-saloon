export interface CatalogItem {
  id: number;
  name: string;
  category: string;
  price_cents: number;
  active: number;
  color: string | null;
  description: string | null;
}

export type PaymentType = "cash" | "card";

export interface SaleLine {
  id: number;
  name: string;
  unit_price_cents: number;
  qty: number;
  line_total_cents: number;
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
  lines?: SaleLine[];
}

export interface DayReport {
  sales: Array<Sale & { item_count: number }>;
  cash_total_cents: number;
  card_total_cents: number;
  total_cents: number;
  count: number;
}

export interface Kpis {
  revenue_cents: number;
  count: number;
  items_sold: number;
  avg_ticket_cents: number;
}

export interface Dashboard {
  range: "today" | "7d" | "30d";
  current: Kpis;
  previous: Kpis;
  series: Array<{ date: string; revenue_cents: number }>;
  payment_mix: { cash_cents: number; card_cents: number };
  recent: Array<{
    id: number;
    created_at: string;
    total_cents: number;
    payment_type: PaymentType;
    item_count: number;
  }>;
}

export type Settings = Record<string, string>;

export interface CartLine {
  key: string;
  name: string;
  unit_price_cents: number;
  qty: number;
}
