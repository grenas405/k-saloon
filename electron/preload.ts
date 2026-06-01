// preload.ts — exposes a minimal, explicit API to the renderer.
//
// MUST compile to CommonJS: a sandboxed ESM preload silently fails to load,
// leaving window.app undefined. (constraint: commonjs-preload)
import { contextBridge, ipcRenderer } from "electron";

const search = (globalThis as { location?: { search?: string } }).location?.search ?? "";
const params = new URLSearchParams(search);
const portFromQuery = params.get("port");
const backendBaseUrl = portFromQuery
  ? `http://127.0.0.1:${portFromQuery}`
  : "";

contextBridge.exposeInMainWorld("app", {
  backendBaseUrl,
  printDoc: (html: string) => ipcRenderer.invoke("print-doc", html),
  savePdf: (html: string, suggestedName: string) =>
    ipcRenderer.invoke("save-pdf", html, suggestedName),
  getBackendBaseUrl: () => ipcRenderer.invoke("backend-base-url"),
});
