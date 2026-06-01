# K Saloon POS

A local-first desktop point-of-sale app for **K Saloon**
(3711 S High Ave, Oklahoma City, OK 73129).

Fully offline, single-PC. No cloud, no accounts. Data lives in one SQLite file under
the OS user-data directory, with automatic daily backups.

## Architecture

- **Electron shell** (Node main process) — creates the window, spawns the backend as a
  localhost sidecar, exposes a minimal print / save-PDF bridge.
- **Backend** — Deno + Hono HTTP API bound strictly to `127.0.0.1`, SQLite persistence
  via `node:sqlite`. All money math and aggregation happen server-side.
- **Renderer** — Vite + React + TypeScript + Tailwind. Touch-friendly UI.

## Development (this VM — Linux, backend dev + testing)

```sh
deno task test                 # backend unit tests
deno task dev                  # run backend with --watch
deno task build:backend:local  # compile a local Linux backend to dist/k-saloon-backend
npm install                    # install renderer/electron deps
npm run build:renderer         # type-check + bundle the UI to dist-renderer/
```

## Release (Windows host)

```sh
# 1. bump package.json version + add a CHANGES.md entry
deno task build:backend        # dist/k-saloon-backend.exe (windows-msvc)
npm run dist                   # NSIS installer in release/
```

The target PC needs neither Deno nor Node installed.

## Domain customization

This app is built on a domain-agnostic POS core. K Saloon customization lives in:

- `backend/db.ts` `seed()` — settings defaults + seed catalog.
- `renderer/src/catalog-meta.ts` — category presets + button colors.
- `package.json` — app identity (`name`, `build.productName`, `build.appId`).
