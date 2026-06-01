import { useEffect, useState } from "react";
import { api } from "./api";
import type { Settings } from "./types";
import { Register } from "./pages/Register";
import { Dashboard } from "./pages/Dashboard";
import { History } from "./pages/History";
import { Catalog } from "./pages/Catalog";
import { SettingsPage } from "./pages/Settings";

type Tab = "register" | "dashboard" | "history" | "catalog" | "settings";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "register", label: "Register" },
  { id: "dashboard", label: "Dashboard" },
  { id: "history", label: "History" },
  { id: "catalog", label: "Catalog" },
  { id: "settings", label: "Settings" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("register");
  const [settings, setSettings] = useState<Settings>({});

  const loadSettings = () => api.getSettings().then(setSettings).catch(() => {});
  useEffect(() => {
    loadSettings();
  }, []);

  const shopName = settings.business_name || "K Saloon";

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="font-display text-lg font-extrabold leading-tight tracking-tight text-slate-900">
              {shopName}
            </h1>
            <p className="text-xs text-slate-400">
              Point of Sale · v{__APP_VERSION__}
            </p>
          </div>
        </div>
        <nav className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                tab === t.id
                  ? "bg-white text-slate-900 shadow ring-1 ring-amber-100"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        {tab === "register" && <Register />}
        {tab === "dashboard" && <Dashboard />}
        {tab === "history" && <History />}
        {tab === "catalog" && <Catalog />}
        {tab === "settings" && (
          <SettingsPage settings={settings} onSaved={loadSettings} />
        )}
      </main>
    </div>
  );
}
