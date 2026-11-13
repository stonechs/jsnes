import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exampleDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(exampleDir, "..");
const versionDir = path.join(projectDir, "dist", "V1");
const readable = process.argv.includes("--readable");
const outputName = readable
  ? "jsnes-v1-standalone-readable.html"
  : "jsnes-v1-standalone.html";
const metadataName = readable
  ? "jsnes-v1-standalone-readable.json"
  : "jsnes-v1-standalone.json";
const corePath = readable ? "dist/V1/jsnes.js" : "dist/V1/jsnes.min.js";
const outputPath = path.join(versionDir, outputName);

if (fs.existsSync(path.join(versionDir, "RELEASED.json"))) {
  throw new Error("V1 is finalized; use a new output directory.");
}

const read = (relativePath) =>
  fs.readFileSync(path.join(projectDir, relativePath), "utf8");
const htmlPath = path.join(exampleDir, "nes-player.html");
let html = fs.readFileSync(htmlPath, "utf8");
const core = read(corePath).replace(
  /\n?\/\/# sourceMappingURL=.*(?:\r?\n|$)/g,
  "",
);
const scripts = [
  ["<script src=\"../dist/V1/jsnes.js\"></script>", core],
  ['<script src="rom-loader.js"></script>', read("example/rom-loader.js")],
  ['<script src="nes-player.js"></script>', read("example/nes-player.js")],
];

for (const [marker, source] of scripts) {
  if (!html.includes(marker)) throw new Error(`Missing script marker: ${marker}`);
  const inline = source.replace(/<\/script/gi, "<\\/script");
  html = html.replace(marker, `<script>\n${inline}\n</script>`);
}

const license = read("LICENSE");
html = html.replace(
  "</body>",
  `<!-- JSNES 2.1.0; adapted V013 interface and ROM loader from stonechs/jsnes-lite.\n${license}\n-->\n</body>`,
);
if (/<script\s+src=|<link\s+href=/i.test(html)) {
  throw new Error("Standalone output still references an external resource.");
}

fs.mkdirSync(versionDir, { recursive: true });
fs.writeFileSync(outputPath, html);
const data = fs.readFileSync(outputPath);
const metadata = {
  artifact: outputName,
  bytes: data.length,
  sha256: crypto.createHash("sha256").update(data).digest("hex"),
  core: `JSNES 2.1.0 from ${path.basename(corePath)}`,
  readable,
  interface: "Adapted from jsnes-lite V013 mobile touch UI",
  romFormats: [".nes", ".zip (single-ROM, stored/deflate)", ".7z (single-file LZMA/LZMA2)"],
  externalResources: false,
};
fs.writeFileSync(
  path.join(versionDir, metadataName),
  `${JSON.stringify(metadata, null, 2)}\n`,
);
console.log(JSON.stringify(metadata, null, 2));
