// Writes dist-electron/package.json with {"type":"commonjs"} so Electron's
// sandboxed preload (which cannot be an ES module) loads correctly even though
// the root package.json is {"type":"module"}. (constraint: commonjs-preload)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "dist-electron");

mkdirSync(outDir, { recursive: true });
writeFileSync(
  resolve(outDir, "package.json"),
  JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
);

console.log("wrote dist-electron/package.json {type:commonjs}");
