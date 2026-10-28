import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = join(root, "node_modules/pdfjs-dist");
const manifest = JSON.parse(
  await readFile(join(packageRoot, "package.json"), "utf8"),
);
if (manifest.version !== "6.4.299")
  throw new Error(
    "PDF.js resource version must match the pinned viewer version 6.4.299",
  );
const destination = join(root, "apps/web/public/pdfjs");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(join(packageRoot, directory), join(destination, directory), {
    recursive: true,
  });
}
await cp(join(packageRoot, "LICENSE"), join(destination, "LICENSE"));
await cp(join(packageRoot, "package.json"), join(destination, "package.json"));
console.log(
  `Prepared PDF.js ${manifest.version} fonts, character maps and image codecs.`,
);
