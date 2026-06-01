/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface AppBridge {
  backendBaseUrl: string;
  printDoc: (html: string) => Promise<{ ok: boolean }>;
  savePdf: (
    html: string,
    suggestedName: string,
  ) => Promise<{ ok: boolean; canceled?: boolean; filePath?: string }>;
  getBackendBaseUrl: () => Promise<string>;
  openPath: (path: string) => Promise<{ ok: boolean; error?: string }>;
}

interface Window {
  app?: AppBridge;
  __BACKEND_BASE__?: string;
}
