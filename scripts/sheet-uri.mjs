import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function sheetUri(dir, file) {
  const path = join(dir, file || "");
  if (!file || !existsSync(path)) throw new Error(`drawing sheet missing: ${path}: run scripts/verify-patents.mjs --drawings`);
  return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
}
