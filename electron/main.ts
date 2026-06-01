// main.ts — Electron main process.
//
// Picks a free 127.0.0.1 port, spawns the Deno backend sidecar (passing POS_PORT
// and POS_DB_PATH), polls /health, then loads the UI. Exposes print / save-PDF
// IPC and kills the sidecar on quit. (constraints: localhost-only, secure-electron)
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

let backend: ChildProcess | null = null;
let backendPort = 0;
const isDev = !app.isPackaged;

/** Ask the OS for a free ephemeral port on the loopback interface. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

function backendBinaryPath(): string {
  // Packaged: bundled as an extraResource. Dev: the locally compiled binary.
  if (app.isPackaged) {
    return join(process.resourcesPath, "backend", "k-saloon-backend.exe");
  }
  const exe = process.platform === "win32" ? "k-saloon-backend.exe" : "k-saloon-backend";
  return join(app.getAppPath(), "dist", exe);
}

function spawnBackend(port: number): ChildProcess {
  const dbPath = join(app.getPath("userData"), "pos.db");
  const bin = backendBinaryPath();
  console.log(`[backend] spawning ${bin}`);
  const child = spawn(bin, [], {
    env: { ...process.env, POS_PORT: String(port), POS_DB_PATH: dbPath },
    stdio: app.isPackaged ? "ignore" : "inherit",
    windowsHide: true,
  });
  child.on("error", (err) =>
    console.error(`[backend] failed to spawn (${bin}):`, err.message));
  child.on("exit", (code) => console.log(`[backend] exited ${code}`));
  return child;
}

async function waitForHealth(port: number, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("backend did not become healthy in time");
}

async function createWindow(): Promise<void> {
  backendPort = await findFreePort();
  backend = spawnBackend(backendPort);
  await waitForHealth(backendPort);

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: "#0b0f17",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Surface load failures instead of a silent blank window.
  win.webContents.on("did-fail-load", (_e, code, desc, url) =>
    console.error(`[renderer] did-fail-load ${code} ${desc} ${url}`));
  if (isDev || process.env.POS_DEBUG) {
    win.webContents.openDevTools({ mode: "detach" });
  }

  const base = `http://127.0.0.1:${backendPort}`;
  if (isDev) {
    await win.loadURL(`http://127.0.0.1:5173/?port=${backendPort}`);
  } else {
    await win.loadFile(join(__dirname, "..", "dist-renderer", "index.html"), {
      query: { port: String(backendPort) },
    });
  }
  win.webContents.once("did-finish-load", () => {
    win.webContents.executeJavaScript(
      `window.__BACKEND_BASE__ = ${JSON.stringify(base)};`,
    ).catch(() => {});
  });
}

// --- OS-only IPC: print + save-PDF ------------------------------------------

/** Render arbitrary HTML in an offscreen window so we print ONLY the receipt,
 *  never the whole app window. */
async function withReceiptWindow<T>(
  html: string,
  fn: (w: BrowserWindow) => Promise<T>,
): Promise<T> {
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await w.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    return await fn(w);
  } finally {
    if (!w.isDestroyed()) w.destroy();
  }
}

ipcMain.handle("print-doc", async (_e, html: string) => {
  return await withReceiptWindow(html, (w) =>
    new Promise<{ ok: boolean }>((resolve) => {
      w.webContents.print({ silent: false, printBackground: true }, (ok) =>
        resolve({ ok }));
    }));
});

ipcMain.handle("save-pdf", async (_e, html: string, suggestedName: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: suggestedName || "receipt.pdf",
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  return await withReceiptWindow(html, async (w) => {
    const data = await w.webContents.printToPDF({ printBackground: true });
    writeFileSync(filePath, data);
    return { ok: true, filePath };
  });
});

ipcMain.handle("backend-base-url", () => `http://127.0.0.1:${backendPort}`);

ipcMain.handle("open-path", async (_e, path: string) => {
  if (!path) return { ok: false, error: "path required" };
  const error = await shell.openPath(path);
  return error ? { ok: false, error } : { ok: true };
});

// --- lifecycle ---------------------------------------------------------------

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function killBackend(): void {
  if (backend && !backend.killed) {
    backend.kill();
    backend = null;
  }
}
app.on("before-quit", killBackend);
app.on("quit", killBackend);
process.on("exit", killBackend);
