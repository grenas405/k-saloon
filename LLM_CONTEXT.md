# K Saloon POS LLM Context

This file combines `instructions.json`, `deno.json`, and `package.json` so an LLM coding agent can read the project contract and build configuration from one place. The fenced JSON sections are the source material.

## Quick Orientation

- Project: k-saloon-pos 0.4.0
- Product: K Saloon POS
- Description: K Saloon POS — local-first desktop app (Electron shell + Deno/Hono backend + Vite/React UI)
- Spec: local-first-business-app 1.1.0
- Audience: LLM coding agents (Codex, Claude, etc.)
- Architecture: Local-first desktop app = Electron app shell + a Deno HTTP backend running as a localhost sidecar process + a single-file SQLite database. Fully offline; no cloud, no accounts.
- Backend task target: deno compile --no-terminal --no-npm --allow-net --allow-read --allow-write --allow-env --output dist/k-saloon-backend.exe --target x86_64-pc-windows-msvc backend/server.ts
- Electron entry: dist-electron/main.js
- Package type: module
- Key dependencies: @types/react, @types/react-dom, @vitejs/plugin-react, autoprefixer, concurrently, electron, electron-builder, postcss, react, react-dom, tailwindcss, typescript, vite, wait-on

## Must-Preserve Constraints

- money-integer-cents: Store and compute all money as integer cents. Never use floats for currency.
- server-side-totals: The backend recomputes subtotal/tax/total from line items and the stored tax rate on every create. Never trust totals sent by the client.
- local-day-grouping: Store created_at as UTC ISO for display, but also store a separate sale_date = local YYYY-MM-DD and group/report by sale_date.
- deno-compile-no-npm: The deno.json build:backend task MUST pass --no-npm and set "nodeModulesDir": "none".
- windows-sidecar-no-console: The Windows backend exe MUST be compiled with deno compile --no-terminal, and Electron MUST spawn the packaged sidecar with windowsHide:true and stdio:'ignore' (dev may keep stdio:'inherit').
- commonjs-preload: Compile electron/ (main + preload) as CommonJS, and write a dist-electron/package.json containing {"type":"commonjs"} during the build. The root package.json is "type":"module".
- sqlite-backup-method: For backups, do NOT use 'VACUUM INTO' (unsupported by node:sqlite — attached-db limit is 0). Instead run PRAGMA wal_checkpoint(TRUNCATE) then copy the db file.
- additive-migrations: Schema changes are additive and idempotent: CREATE TABLE IF NOT EXISTS, plus an addColumnIfMissing(table,col,type) helper that checks PRAGMA table_info before ALTER. Backfill new columns. Never drop/rewrite existing data on upgrade.
- localhost-only: Bind the backend to 127.0.0.1 only. Pick a free ephemeral port at launch; the renderer learns it via a ?port= query param and/or the preload bridge.
- secure-electron: contextIsolation: true, nodeIntegration: false. Expose only an explicit, minimal API via contextBridge (e.g., window.app = { backendBaseUrl, printDoc, savePdf }).
- offline-charts: Render charts/sparklines as inline SVG. Do not add a charting dependency.
- version-in-ui-and-changelog: Inject the package.json version at build time (Vite define __APP_VERSION__) and show it subtly in the header + a Settings 'About' line. Bump package.json version and add a CHANGES.md entry for every shippable change.
- vite-relative-base: Set "base": "./" in vite.config.ts so the built index.html references ./assets/... (relative), not /assets/... (absolute).
- embed-binary-assets: Any static asset the BACKEND serves (logo, images) must be embedded as a base64 data URI compiled into the exe — generate a TS module (e.g. backend/logo.ts via scripts/embed-logo.mjs) and import it. The RENDERER imports the same file as a normal Vite asset (import logoUrl from './assets/x.jpg').
- print-color-fidelity: Receipts that use color (brand bars, logos) MUST set '-webkit-print-color-adjust: exact; print-color-adjust: exact;' and an '@page { size: 80mm auto; margin: 0 }'. Electron's webContents.print() has NO preview pane, so provide an in-app preview by rendering the receipt HTML in a sandboxed <iframe srcDoc=...> with Print / Save PDF buttons.
- additive-settings-keys: A new settings key must be added in THREE places: (1) seed() defaults in db.ts, (2) the ALLOWED set in routes/settings.ts, and (3) a code-level fallback default where it is consumed (e.g. receipt.ts). Never assume the key exists.
- node-sqlite-row-typing: node:sqlite .all()/.get() return Record<string, SQLOutputValue>. Cast typed rows through unknown first: 'stmt.all() as unknown as Row[]'. Coerce money columns with Number() at the boundary if doing arithmetic.

## Deno Tasks

- deno task dev: deno run --watch --allow-net --allow-read --allow-write --allow-env backend/server.ts
- deno task start: deno run --allow-net --allow-read --allow-write --allow-env backend/server.ts
- deno task test: deno test --allow-net --allow-read --allow-write --allow-env backend/
- deno task build:backend: deno compile --no-terminal --no-npm --allow-net --allow-read --allow-write --allow-env --output dist/k-saloon-backend.exe --target x86_64-pc-windows-msvc backend/server.ts
- deno task build:backend:local: deno compile --no-npm --allow-net --allow-read --allow-write --allow-env --output dist/k-saloon-backend backend/server.ts

## NPM Scripts

- npm run dev: concurrently -k -n vite,electron -c cyan,magenta "npm:dev:renderer" "npm:dev:electron"
- npm run dev:renderer: vite
- npm run dev:electron: tsc -p electron/tsconfig.json && node scripts/write-electron-cjs.mjs && wait-on tcp:5173 && electron .
- npm run build:renderer: vite build
- npm run build:electron: tsc -p electron/tsconfig.json && node scripts/write-electron-cjs.mjs
- npm run build: npm run build:renderer && npm run build:electron
- npm run dist: npm run build && electron-builder --win
- npm run rebuild:backend: deno task build:backend

## Full Source: instructions.json

```json
{
  "spec": "local-first-business-app",
  "specVersion": "1.1.0",
  "audience": "LLM coding agents (Codex, Claude, etc.)",
  "purpose": "Implement a local-first desktop point-of-sale / business app for a single-location small business, reusing a fixed set of primitives. The reference implementation is a tire shop; this spec generalizes it to other domains (hair salons, detail shops, flower shops, and similar service+product businesses).",
  "howToUse": [
    "Read this file top to bottom before writing code.",
    "Build the domain-agnostic CORE exactly as specified (architecture, primitives, constraints).",
    "Then apply ONE domainPack to customize branding, categories, and seed data. Do not fork the core per domain — only the domainPack changes.",
    "Honor every entry in 'constraints' — each one encodes a real bug that was fixed in the reference implementation.",
    "Run the 'verification' steps before declaring done.",
    "'constraints' is a LIVING LOG of real bugs. When you hit and fix a non-obvious issue, append a new entry (id + rule + why) so the next instantiation cannot repeat it."
  ],

  "architecture": {
    "pattern": "Local-first desktop app = Electron app shell + a Deno HTTP backend running as a localhost sidecar process + a single-file SQLite database. Fully offline; no cloud, no accounts.",
    "processes": [
      {
        "name": "electron-main",
        "runtime": "Node (Electron main process)",
        "responsibilities": [
          "Create the BrowserWindow (contextIsolation: true, nodeIntegration: false).",
          "Pick a free 127.0.0.1 port, spawn the Deno backend as a child process, pass POS_PORT and POS_DB_PATH via env.",
          "Poll GET /health until ready, then load the UI.",
          "Expose a minimal IPC bridge for OS-only actions (print, save-PDF).",
          "Kill the sidecar on quit."
        ]
      },
      {
        "name": "backend",
        "runtime": "Deno + Hono",
        "responsibilities": [
          "HTTP API bound strictly to 127.0.0.1 (never a public interface).",
          "SQLite persistence via node:sqlite (built into Deno; no native build).",
          "All money math and aggregation server-side."
        ]
      },
      {
        "name": "renderer",
        "runtime": "Vite + React + TypeScript + Tailwind (Chromium renderer)",
        "responsibilities": [
          "Touch-friendly UI (large targets, big type) for non-technical staff.",
          "Talks to the backend over http://127.0.0.1:<port> via fetch.",
          "Calls the preload bridge for print / save-PDF."
        ]
      }
    ],
    "boundaries": [
      "renderer -> backend: plain HTTP over loopback (runtime-agnostic, cloud-portable later).",
      "renderer -> electron-main: a tiny contextBridge surface (window.app) for OS actions only."
    ],
    "packaging": "deno compile the backend into a single self-contained exe; electron-builder bundles it as an extraResource and produces a Windows NSIS installer. Target PC needs neither Deno nor Node installed."
  },

  "techStack": {
    "backend": { "runtime": "Deno 2.x", "framework": "jsr:@hono/hono@^4", "db": "node:sqlite (built-in)", "test": "deno test + jsr:@std/assert" },
    "shell": { "framework": "Electron ^41", "packager": "electron-builder ^25 (nsis, win)" },
    "frontend": { "build": "Vite ^6", "ui": "React ^18 + TypeScript ^5.7", "styles": "Tailwind ^3", "charts": "hand-rolled inline SVG (NO chart library — keep it offline and dependency-free)" }
  },

  "constraints": [
    {
      "id": "money-integer-cents",
      "rule": "Store and compute all money as integer cents. Never use floats for currency.",
      "why": "Avoids floating-point rounding errors in totals/tax."
    },
    {
      "id": "server-side-totals",
      "rule": "The backend recomputes subtotal/tax/total from line items and the stored tax rate on every create. Never trust totals sent by the client.",
      "why": "Integrity and tamper-resistance."
    },
    {
      "id": "local-day-grouping",
      "rule": "Store created_at as UTC ISO for display, but also store a separate sale_date = local YYYY-MM-DD and group/report by sale_date.",
      "why": "Grouping by the UTC slice of created_at drops evening sales from 'today' in negative UTC offsets. Use a localDateString() helper for both writing sale_date and computing 'today'."
    },
    {
      "id": "deno-compile-no-npm",
      "rule": "The deno.json build:backend task MUST pass --no-npm and set \"nodeModulesDir\": \"none\".",
      "why": "Otherwise deno compile detects the Electron package.json and embeds the entire node_modules tree into the backend exe (hundreds of MB)."
    },
    {
      "id": "windows-sidecar-no-console",
      "rule": "The Windows backend exe MUST be compiled with deno compile --no-terminal, and Electron MUST spawn the packaged sidecar with windowsHide:true and stdio:'ignore' (dev may keep stdio:'inherit').",
      "why": "Without these, launching the installed POS also opens a visible backend console window, which looks broken to staff and invites accidental closure of the sidecar."
    },
    {
      "id": "commonjs-preload",
      "rule": "Compile electron/ (main + preload) as CommonJS, and write a dist-electron/package.json containing {\"type\":\"commonjs\"} during the build. The root package.json is \"type\":\"module\".",
      "why": "Electron's sandboxed preload cannot be an ES module; an ESM preload silently fails to load, leaving window.app undefined (print/save-PDF break)."
    },
    {
      "id": "sqlite-backup-method",
      "rule": "For backups, do NOT use 'VACUUM INTO' (unsupported by node:sqlite — attached-db limit is 0). Instead run PRAGMA wal_checkpoint(TRUNCATE) then copy the db file.",
      "why": "node:sqlite limitation; checkpoint+copy yields a consistent standalone snapshot."
    },
    {
      "id": "additive-migrations",
      "rule": "Schema changes are additive and idempotent: CREATE TABLE IF NOT EXISTS, plus an addColumnIfMissing(table,col,type) helper that checks PRAGMA table_info before ALTER. Backfill new columns. Never drop/rewrite existing data on upgrade.",
      "why": "Installed copies already hold the business's live data."
    },
    {
      "id": "localhost-only",
      "rule": "Bind the backend to 127.0.0.1 only. Pick a free ephemeral port at launch; the renderer learns it via a ?port= query param and/or the preload bridge.",
      "why": "Security; never expose the API to the network."
    },
    {
      "id": "secure-electron",
      "rule": "contextIsolation: true, nodeIntegration: false. Expose only an explicit, minimal API via contextBridge (e.g., window.app = { backendBaseUrl, printDoc, savePdf }).",
      "why": "Standard Electron security posture."
    },
    {
      "id": "offline-charts",
      "rule": "Render charts/sparklines as inline SVG. Do not add a charting dependency.",
      "why": "Keeps the app fully offline and the bundle small."
    },
    {
      "id": "version-in-ui-and-changelog",
      "rule": "Inject the package.json version at build time (Vite define __APP_VERSION__) and show it subtly in the header + a Settings 'About' line. Bump package.json version and add a CHANGES.md entry for every shippable change.",
      "why": "Lets staff/support identify the running build; keeps in-place installer upgrades clean (NSIS upgrades require an equal-or-higher version)."
    },
    {
      "id": "vite-relative-base",
      "rule": "Set \"base\": \"./\" in vite.config.ts so the built index.html references ./assets/... (relative), not /assets/... (absolute).",
      "why": "The packaged app loads index.html over the file:// protocol. Absolute /assets/ paths resolve to the filesystem root and 404, leaving a blank window. Add did-fail-load logging in electron/main.ts so a load failure is never silent."
    },
    {
      "id": "embed-binary-assets",
      "rule": "Any static asset the BACKEND serves (logo, images) must be embedded as a base64 data URI compiled into the exe — generate a TS module (e.g. backend/logo.ts via scripts/embed-logo.mjs) and import it. The RENDERER imports the same file as a normal Vite asset (import logoUrl from './assets/x.jpg').",
      "why": "The backend ships as a single 'deno compile' exe with no asset files on disk, so it cannot read a logo from the filesystem at runtime. Inlined data URIs also avoid async <img> load races during print()/printToPDF()."
    },
    {
      "id": "print-color-fidelity",
      "rule": "Receipts that use color (brand bars, logos) MUST set '-webkit-print-color-adjust: exact; print-color-adjust: exact;' and an '@page { size: 80mm auto; margin: 0 }'. Electron's webContents.print() has NO preview pane, so provide an in-app preview by rendering the receipt HTML in a sandboxed <iframe srcDoc=...> with Print / Save PDF buttons.",
      "why": "Without print-color-adjust, Chromium drops background colors when printing/exporting. Staff expect to see the receipt before printing; webContents.print() jumps straight to the OS dialog, so the iframe IS the preview (and gives the browser's native preview during dev)."
    },
    {
      "id": "additive-settings-keys",
      "rule": "A new settings key must be added in THREE places: (1) seed() defaults in db.ts, (2) the ALLOWED set in routes/settings.ts, and (3) a code-level fallback default where it is consumed (e.g. receipt.ts). Never assume the key exists.",
      "why": "seed() only runs when the settings table is EMPTY, so already-installed DBs never receive the new key. The consuming code must fall back to a default until the user saves Settings; the allow-list gate silently drops keys it doesn't recognize."
    },
    {
      "id": "node-sqlite-row-typing",
      "rule": "node:sqlite .all()/.get() return Record<string, SQLOutputValue>. Cast typed rows through unknown first: 'stmt.all() as unknown as Row[]'. Coerce money columns with Number() at the boundary if doing arithmetic.",
      "why": "TypeScript rejects a direct cast from the SQLOutputValue record to a named interface ('neither type sufficiently overlaps'). Casting via unknown is the intended escape hatch."
    }
  ],

  "projectStructure": {
    "root": ["package.json", "deno.json", "vite.config.ts", "tailwind.config.js", "postcss.config.js", "tsconfig.json", "README.md", "CHANGES.md", ".gitignore"],
    "scripts/": ["write-electron-cjs.mjs (writes dist-electron/package.json {type:commonjs})", "embed-logo.mjs (bakes the logo into backend/logo.ts as a base64 data URI + copies it to renderer/src/assets/)"],
    "electron/": ["main.ts (window + sidecar spawn + health poll + print/savePdf IPC; packaged sidecar uses windowsHide:true + stdio:'ignore'; did-fail-load logging + POS_DEBUG devtools)", "preload.ts (contextBridge: backendBaseUrl, printDoc, savePdf)", "tsconfig.json (module: CommonJS)"],
    "backend/": ["server.ts (Hono app, binds 127.0.0.1, /health, createApp(db) export)", "db.ts (node:sqlite Database class: schema, migrations, seed, queries, dashboard(), backupDaily(); exported helpers computeTotals, localDateString, dateMinusDays)", "logo.ts (AUTO-GENERATED data URI; see embed-logo.mjs)", "routes/ (catalog.ts, transactions.ts, settings.ts)", "receipt.ts (branded printable HTML)", "server_test.ts (deno test)"],
    "renderer/": ["index.html", "src/main.tsx", "src/App.tsx (tab nav + header with logo + version)", "src/api.ts (fetch wrapper + dollars/parseDollars helpers)", "src/types.ts", "src/catalog-meta.ts (CATEGORIES + COLORS presets — DOMAIN-CUSTOMIZED)", "src/assets/ (logo jpg — DOMAIN-CUSTOMIZED)", "src/hooks/ (useCountUp.ts)", "src/components/ (ReceiptPreview.tsx — iframe receipt preview reused by Checkout + Dashboard)", "src/pages/ (Register.tsx — may be renamed per domainPack e.g. Checkout.tsx, Dashboard.tsx, Catalog.tsx, Settings.tsx)", "src/index.css (Tailwind + --brand-* tokens + print/reduced-motion CSS)", "src/vite-env.d.ts (declares __APP_VERSION__)"]
  },

  "dataModel": {
    "settings": "key/value TEXT: business_name, business_address, business_phone, tax_rate (fraction string, e.g. '0.08625'), receipt_footer (multiline text printed at the bottom of receipts; \\n preserved via white-space:pre-line). Seeded with domain defaults. New keys follow the 'additive-settings-keys' constraint.",
    "catalog_items": "id, name, category, price_cents, active (0/1, soft-hide), color (hex|null, button color), description (text|null). Soft-delete sets active=0; permanent delete removes the row.",
    "sales": "id, created_at (UTC ISO), sale_date (local YYYY-MM-DD), subtotal_cents, tax_cents, total_cents, payment_type ('cash'|'card'), cash_tendered_cents (nullable), change_cents (nullable). NOTE: 'sales' is the generic transaction table; keep the table name even if the domain calls them 'tickets', 'orders', or 'visits'.",
    "sale_line_items": "id, sale_id (FK, ON DELETE CASCADE), name, unit_price_cents, qty, line_total_cents. Stores a SNAPSHOT of name/price so editing or deleting a catalog item never alters historical transactions."
  },

  "api": [
    { "method": "GET", "path": "/health", "desc": "Readiness probe for the launcher." },
    { "method": "GET", "path": "/catalog?all=1", "desc": "List items (all=1 includes inactive)." },
    { "method": "POST", "path": "/catalog", "desc": "Create item {name,category,price_cents,color?,description?}." },
    { "method": "PUT", "path": "/catalog/:id", "desc": "Update item (incl. active, color, description)." },
    { "method": "DELETE", "path": "/catalog/:id", "desc": "Soft-hide; ?permanent=1 removes the row." },
    { "method": "GET", "path": "/settings", "desc": "Read settings." },
    { "method": "PUT", "path": "/settings", "desc": "Update allowed settings keys (validate tax_rate in [0,1])." },
    { "method": "POST", "path": "/sales", "desc": "Create a transaction; server recomputes totals; transactional insert of sale + lines." },
    { "method": "GET", "path": "/sales?date=today", "desc": "Transactions for a local day + cash/card totals." },
    { "method": "GET", "path": "/sales/dashboard?range=today|7d|30d", "desc": "KPIs (revenue, count, avg ticket, items), prior-period comparison, daily series, recent list." },
    { "method": "GET", "path": "/sales/:id/receipt", "desc": "Printable receipt HTML." }
  ],

  "coreFeatures": {
    "register": "Tap catalog buttons (colored by item.color, grouped by category, filterable by category tabs) or add a custom line item; adjust qty; Cash (amount tendered -> change due) or Card (recorded; charged on a separate terminal); complete -> persist -> print/save-PDF receipt -> clear.",
    "dashboard": "Dark 'command center': range toggle (Today/7d/30d), animated count-up KPI cards with vs-prior-period delta chips, inline SVG revenue sparkline, cash/card mix bar, recent transactions list with reprint, polished empty state.",
    "catalog": "Manage items: name, category (preset dropdown + custom), price, button color, description/note, Available toggle (hide/show), and permanent delete. Lists inactive items too.",
    "settings": "Business name/address/phone (printed on receipts; name shown in header), editable tax rate, About/version line.",
    "receipts": "Render branded receipt HTML: embedded logo header (data URI, see 'embed-binary-assets'), line items with qty×unit subline, subtotal/tax, a filled brand-color TOTAL bar (print-color-adjust), a Cash/Card badge + change, and an editable receipt_footer. Reviewed in an in-app iframe preview (see 'print-color-fidelity'), then Print via OS dialog or Save as PDF — no hardware required.",
    "backups": "On startup, write a consistent daily snapshot to <db-dir>/backups/<app>-YYYY-MM-DD.db (checkpoint + copy), retain newest ~14, prune older. Never block startup on backup failure."
  },

  "domainModel": {
    "principle": "The core is a universal 'catalog of priced things -> cart -> paid transaction -> receipt -> dashboard'. EVERY listed domain maps onto it without schema changes. Customize only: branding/settings defaults, category presets + colors (catalog-meta.ts), seed catalog items, and optional UI relabeling (e.g., 'Register' -> 'Checkout').",
    "customizationPoints": [
      "backend/db.ts seed(): settings defaults (business_name/address/phone, tax_rate, receipt_footer) + SEED_CATALOG items.",
      "renderer/src/catalog-meta.ts: CATEGORIES preset list + COLORS palette.",
      "Brand accent color: renderer/src/index.css --brand-from/via/to CSS vars — drive .bg-brand/.text-brand (header, CTAs, count-up totals, active pills) and the receipt TOTAL bar. Sweep any literal pink-/violet- utilities to match.",
      "Logo: run scripts/embed-logo.mjs to bake <logo>.jpg into backend/logo.ts (data URI for receipts) AND copy it to renderer/src/assets/ for the header (imported in App.tsx).",
      "package.json: name, description, build.appId, build.productName, build.nsis.shortcutName.",
      "Optional: tab labels in App.tsx (e.g. 'Register' -> 'Checkout') and receipt wording in receipt.ts."
    ]
  },

  "domainPacks": {
    "tire_shop": {
      "appName": "Rivera Tire POS",
      "categories": ["New Tires", "Used Tires", "Wheels", "Service", "Parts", "Fees", "TPMS", "Alignment", "Batteries", "Accessories"],
      "seedCatalog": [
        { "name": "New Tire", "category": "New Tires", "price_cents": 12000 },
        { "name": "Used Tire", "category": "Used Tires", "price_cents": 4500 },
        { "name": "Mount & Balance", "category": "Service", "price_cents": 2000 },
        { "name": "Flat Repair", "category": "Service", "price_cents": 2500 },
        { "name": "Tire Rotation", "category": "Service", "price_cents": 2000 },
        { "name": "TPMS Service", "category": "TPMS", "price_cents": 6000 },
        { "name": "Tire Disposal Fee", "category": "Fees", "price_cents": 300 }
      ]
    },
    "hair_salon": {
      "appName": "Salon POS",
      "registerLabel": "Checkout",
      "categories": ["Haircuts", "Color", "Styling", "Treatments", "Add-ons", "Retail Products", "Fees"],
      "seedCatalog": [
        { "name": "Women's Cut", "category": "Haircuts", "price_cents": 4500 },
        { "name": "Men's Cut", "category": "Haircuts", "price_cents": 3000 },
        { "name": "Root Color", "category": "Color", "price_cents": 7500 },
        { "name": "Full Highlights", "category": "Color", "price_cents": 14000 },
        { "name": "Blowout", "category": "Styling", "price_cents": 4000 },
        { "name": "Deep Conditioning", "category": "Treatments", "price_cents": 2500 },
        { "name": "Shampoo (Retail)", "category": "Retail Products", "price_cents": 2200 }
      ],
      "notes": "Tips are common in salons — if needed, add an optional tip_cents column to sales via addColumnIfMissing and a tip step at checkout. Appointments are OUT of core scope; keep POS-only unless explicitly requested."
    },
    "detail_shop": {
      "appName": "Detail Shop POS",
      "categories": ["Packages", "Exterior", "Interior", "Add-ons", "Protection", "Fees"],
      "seedCatalog": [
        { "name": "Basic Wash", "category": "Packages", "price_cents": 3000 },
        { "name": "Full Detail", "category": "Packages", "price_cents": 18000 },
        { "name": "Wax & Polish", "category": "Exterior", "price_cents": 8000 },
        { "name": "Interior Shampoo", "category": "Interior", "price_cents": 9000 },
        { "name": "Pet Hair Removal", "category": "Add-ons", "price_cents": 3500 },
        { "name": "Ceramic Coating", "category": "Protection", "price_cents": 50000 }
      ]
    },
    "flower_shop": {
      "appName": "Flower Shop POS",
      "categories": ["Bouquets", "Arrangements", "Single Stems", "Plants", "Add-ons", "Delivery", "Fees"],
      "seedCatalog": [
        { "name": "Dozen Roses", "category": "Bouquets", "price_cents": 6500 },
        { "name": "Mixed Bouquet", "category": "Bouquets", "price_cents": 4500 },
        { "name": "Custom Arrangement", "category": "Arrangements", "price_cents": 8500 },
        { "name": "Potted Plant", "category": "Plants", "price_cents": 3000 },
        { "name": "Greeting Card", "category": "Add-ons", "price_cents": 600 },
        { "name": "Local Delivery", "category": "Delivery", "price_cents": 1500 }
      ],
      "notes": "Delivery is just a catalog item/line; no special handling needed for the core."
    }
  },

  "buildWorkflow": {
    "denoTasks": {
      "dev": "deno run --watch --allow-net --allow-read --allow-write --allow-env backend/server.ts",
      "test": "deno test --allow-net --allow-read --allow-write --allow-env backend/",
      "build:backend": "deno compile --no-terminal --no-npm --allow-net --allow-read --allow-write --allow-env --output dist/<app>-backend.exe --target x86_64-pc-windows-msvc backend/server.ts"
    },
    "npmScripts": {
      "dev": "concurrently vite + (tsc electron -> write-electron-cjs.mjs -> wait-on 5173 -> electron .)",
      "build:renderer": "vite build",
      "build:electron": "tsc -p electron/tsconfig.json && node scripts/write-electron-cjs.mjs",
      "dist": "npm run build && electron-builder --win"
    },
    "releaseOrder": ["bump package.json version + add CHANGES.md entry", "deno task build:backend", "npm run dist"],
    "freshCloneOrder": ["npm install", "deno cache backend/server.ts", "deno task build:backend", "npm run dist"]
  },

  "verification": {
    "backend": [
      "deno test passes: tax math + server-side total recompute; cash change-due; configurable tax rate; catalog soft-delete vs permanent; sale_date set to local day and returned by listSalesForDay(localToday); migrations add+backfill columns on an old-schema DB; backupDaily writes one snapshot/day, prunes, and is a no-op for :memory:; dashboard today/7d/30d sums, prev windows, daily series lengths (7/7/30), items_sold, avg_ticket, empty range has no divide-by-zero; HTTP shapes for /sales and /sales/dashboard.",
      "Live: run backend, POST a sale, GET /sales/dashboard?range=today and confirm values + that a backups/ file appears.",
      "renderReceipt() output embeds the logo data URI (data:image/...) and the receipt_footer text; PUT /settings accepts receipt_footer; the TOTAL bar markup is present."
    ],
    "frontend": ["npm run build:renderer type-checks and bundles clean; __APP_VERSION__ is baked into the bundle; the built index.html references ./assets/... (relative base) and the logo asset is emitted under dist-renderer/assets/."],
    "shell": ["After packaging, on the target OS: the UI renders (NOT a blank window — confirms vite base './'), window.app is defined (preload loaded), Save PDF opens the OS dialog and writes a valid PDF, Print renders the formatted receipt with its background colors intact (not the whole window)."],
    "endToEnd": ["Ring a sale -> receipt prints/saves; Dashboard KPIs animate and toggle Today/7d/30d; data persists across restart; the daily backup file exists."]
  },

  "implementationSteps": [
    "1. Scaffold configs (package.json, deno.json with the constraints above, vite/tailwind/postcss/tsconfig, electron/tsconfig.json as CommonJS, scripts/write-electron-cjs.mjs, .gitignore).",
    "2. Backend db.ts: Database class with schema, addColumnIfMissing migrations, seed (domainPack), computeTotals, localDateString, dateMinusDays, createSale (transactional, server-side totals, sale_date), catalog CRUD + soft/permanent delete, listSalesForDay, dashboard(range), backupDaily().",
    "3. Backend server.ts (Hono, 127.0.0.1, /health, createApp(db)) + routes (catalog/transactions/settings) + receipt.ts.",
    "4. server_test.ts covering the verification list; run deno test.",
    "5. Electron main.ts (free port, spawn sidecar, health poll, print/savePdf IPC) + preload.ts (contextBridge window.app). Compile CommonJS + marker.",
    "6. Renderer: api.ts, types.ts, catalog-meta.ts (domainPack categories/colors), useCountUp, pages (Register, Dashboard, Catalog, Settings), App.tsx nav + header (shop name + version), Vite define __APP_VERSION__.",
    "7. Apply the chosen domainPack (branding, seeds, categories). Build, test, package.",
    "8. Bump version + CHANGES.md; produce the installer."
  ],

  "acceptanceCriteria": [
    "Runs fully offline on one PC; data in a single SQLite file under the OS user-data dir.",
    "All 'constraints' satisfied (verifiably).",
    "Switching domains required edits ONLY to the domainPack customization points — the core code is identical across domains.",
    "deno test green; renderer builds clean; installer produced; Save PDF / Print work via the preload bridge.",
    "Money correct to the cent; daily totals correct in the evening (local-day grouping); automatic daily backups present."
  ],

  "referenceImplementation": "Rivera Tire POS is the canonical example of the tire_shop domainPack. Jaretzy Hairsalon POS is a proven second instantiation (hair_salon domainPack) that contributed the later 'constraints' — vite-relative-base, embed-binary-assets, print-color-fidelity, additive-settings-keys, node-sqlite-row-typing — plus the brand-color tokens, embedded logo, branded receipt, and in-app receipt preview. Mirror this structure and conventions."
}
```

## Full Source: deno.json

```json
{
  "tasks": {
    "dev": "deno run --watch --allow-net --allow-read --allow-write --allow-env backend/server.ts",
    "start": "deno run --allow-net --allow-read --allow-write --allow-env backend/server.ts",
    "test": "deno test --allow-net --allow-read --allow-write --allow-env backend/",
    "build:backend": "deno compile --no-terminal --no-npm --allow-net --allow-read --allow-write --allow-env --output dist/k-saloon-backend.exe --target x86_64-pc-windows-msvc backend/server.ts",
    "build:backend:local": "deno compile --no-npm --allow-net --allow-read --allow-write --allow-env --output dist/k-saloon-backend backend/server.ts"
  },
  "nodeModulesDir": "none",
  "imports": {
    "@std/assert": "jsr:@std/assert@1",
    "hono": "jsr:@hono/hono@^4.6.14"
  },
  "fmt": {
    "include": ["backend/"]
  },
  "lint": {
    "include": ["backend/"]
  }
}
```

## Full Source: package.json

```json
{
  "name": "k-saloon-pos",
  "version": "0.4.0",
  "description": "K Saloon POS — local-first desktop app (Electron shell + Deno/Hono backend + Vite/React UI)",
  "author": "",
  "license": "UNLICENSED",
  "private": true,
  "type": "module",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "concurrently -k -n vite,electron -c cyan,magenta \"npm:dev:renderer\" \"npm:dev:electron\"",
    "dev:renderer": "vite",
    "dev:electron": "tsc -p electron/tsconfig.json && node scripts/write-electron-cjs.mjs && wait-on tcp:5173 && electron .",
    "build:renderer": "vite build",
    "build:electron": "tsc -p electron/tsconfig.json && node scripts/write-electron-cjs.mjs",
    "build": "npm run build:renderer && npm run build:electron",
    "dist": "npm run build && electron-builder --win",
    "rebuild:backend": "deno task build:backend"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "concurrently": "^9.1.0",
    "electron": "^41.7.1",
    "electron-builder": "^25.1.8",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "vite": "^6.0.3",
    "wait-on": "^8.0.1"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "build": {
    "appId": "com.ksaloon.pos",
    "productName": "K Saloon POS",
    "directories": {
      "output": "release",
      "buildResources": "build"
    },
    "files": [
      "dist-electron/**/*",
      "dist-renderer/**/*"
    ],
    "extraResources": [
      {
        "from": "dist/k-saloon-backend.exe",
        "to": "backend/k-saloon-backend.exe"
      }
    ],
    "win": {
      "target": "nsis",
      "icon": "build/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "shortcutName": "K Saloon POS"
    }
  }
}
```
