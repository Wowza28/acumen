// Copies pdf.js runtime assets (worker, standard fonts, cmaps) into public/
// so the browser can load them — everything stays inside the project
// (no system-level tools required; works in a container without host deps).
import { copyFileSync, mkdirSync, cpSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = path.join(root, "node_modules", "pdfjs-dist");
const outDir = path.join(root, "public", "pdf");

function tryCopy(label, fn) {
  try {
    fn();
    console.log(`[postinstall] ${label}`);
  } catch (e) {
    console.warn(`[postinstall] could not copy ${label}:`, e.message);
  }
}

mkdirSync(outDir, { recursive: true });
tryCopy("pdf.js worker -> public/pdf/", () =>
  copyFileSync(path.join(pkg, "build", "pdf.worker.min.mjs"), path.join(outDir, "pdf.worker.min.mjs"))
);
tryCopy("pdf.js standard fonts -> public/pdf/standard_fonts/", () =>
  cpSync(path.join(pkg, "standard_fonts"), path.join(outDir, "standard_fonts"), { recursive: true })
);
tryCopy("pdf.js cmaps -> public/pdf/cmaps/", () =>
  cpSync(path.join(pkg, "cmaps"), path.join(outDir, "cmaps"), { recursive: true })
);

