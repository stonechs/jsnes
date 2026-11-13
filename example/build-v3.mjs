import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { Packer } from "roadroller";
import { encode, decode, packSixBit } from "./base122.mjs";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist/V3");
const compiler = path.join(
  root,
  "node_modules/google-closure-compiler-windows/compiler.exe",
);
if (fs.existsSync(path.join(out, "RELEASED.json")))
  throw Error("V3 is finalized");
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(out, "source"), { recursive: true });
fs.copyFileSync(
  path.join(root, "dist/V2/source/jsnes.js"),
  path.join(out, "source/jsnes.js"),
);
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const write = (name, data) => fs.writeFileSync(path.join(out, name), data);
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
write("browser.externs.js", "/** @externs */\nvar localStorage;\n");

function compile(name, input, level) {
  write(`${name}.input.js`, input);
  const result = spawnSync(
    compiler,
    [
      "--compilation_level",
      level,
      "--language_in",
      "ECMASCRIPT_NEXT",
      "--language_out",
      "ECMASCRIPT_2020",
      "--emit_use_strict=false",
      "--rewrite_polyfills=false",
      "--warning_level",
      "QUIET",
      "--jscomp_error",
      "undefinedVars",
      "--externs",
      path.join(out, "browser.externs.js"),
      "--js",
      path.join(out, `${name}.input.js`),
      "--js_output_file",
      path.join(out, `${name}.min.js`),
    ],
    { encoding: "utf8" },
  );
  write(`${name}.compiler.log`, (result.stdout || "") + (result.stderr || ""));
  if (result.error || result.status !== 0)
    throw result.error || Error(result.stderr);
  return fs.readFileSync(path.join(out, `${name}.min.js`), "utf8");
}

const template = read("example/nes-player.html");
const core = read("dist/V3/source/jsnes.js").replace(
  /\n?\/\/# sourceMappingURL=.*(?:\r?\n|$)/g,
  "",
);
// One lexical scope is essential: readGameFile and all archive helpers must be
// reachable from the UI callback when Closure analyzes/removes unused code.
const source = `(function(){\n${core}\nconst jsnes = globalThis.jsnes;\n${read("example/rom-loader.js")}\n${read("example/nes-player.js")}\n})();`;
function page(script) {
  let html = template;
  const markers = [
    '<script src="../dist/V1/jsnes.js"></script>',
    '<script src="rom-loader.js"></script>',
    '<script src="nes-player.js"></script>',
  ];
  for (const marker of markers) assert.ok(html.includes(marker), marker);
  html = html.replace(
    markers[0],
    () => `<script>\n${script.replace(/<\/script/gi, "<\\/script")}\n</script>`,
  );
  for (const marker of markers.slice(1)) html = html.replace(marker, () => "");
  assert.ok(!/<script\s+src=/i.test(html));
  return html;
}
const readable = page(source);
const compiled = compile("closure", source, "SIMPLE");
const compiledPage = page(compiled);
const writer = compile(
  "closure.page",
  `document.open();document.write(${JSON.stringify(compiledPage)});document.close();`,
  "ADVANCED",
);

// Keep the established model parameters; rebuilding does not need a new search.
const parameters = {
  modelRecipBaseCount: 50,
  modelMaxCount: 4,
  dynamicModels: 0,
  numAbbreviations: 0,
  sparseSelectors: [0, 1, 3, 6, 7, 13, 25, 57, 103, 321, 327, 399],
  recipLearningRate: 1500,
};
const packer = new Packer(
  [{ data: writer, type: "js", action: "eval" }],
  parameters,
);
const decoder = packer.makeDecoder();
assert.ok(decoder.firstLine.startsWith("eval(Function(\"[M='"));
const stream = decoder.firstLine.slice(
  decoder.firstLine.indexOf("'") + 1,
  decoder.firstLine.lastIndexOf("'"),
);
const binary = packSixBit(stream),
  payload = encode(binary);
assert.deepEqual(decode(payload), binary);
assert.ok(!/[\x00\n\r"&\\]/.test(payload));
assert.ok(decoder.secondLine.includes("M.charCodeAt(d++)&63"));
assert.ok(decoder.secondLine.includes('\")([],'));
const second = decoder.secondLine
  .replace(
    "M.charCodeAt(d++)&63",
    "(M[d*3>>2]<<8|M[(d*3>>2)+1])>>(10-(d++*6&7))&63",
  )
  .replace('\")([],', '\")([data],');
const loader = compile(
  "base122.loader",
  `const decode=${decode.toString()};(()=>{const data=decode(document.getElementById("b122").getAttribute("data-payload"));(0,eval)(Function("[M"${second}})();`,
  "ADVANCED",
);
new vm.Script(loader);
// Concatenation keeps every payload character literal, including dollar signs.
const packed =
  '<!doctype html><meta charset="utf-8"><script id="b122" data-payload="' +
  payload +
  '">' +
  loader +
  "</script>";
// Run the actual final loader with a document sink. This checks the entire
// BASE122 -> Roadroller -> page-writer chain before replacing either artifact.
let restoredPage = "";
vm.runInNewContext(
  loader,
  {
    TextDecoder,
    document: {
      getElementById: () => ({
        getAttribute: () => packed.match(/data-payload="([^"]*)"/)[1],
      }),
      open() {},
      write(html) {
        restoredPage += html;
      },
      close() {},
    },
  },
  { timeout: 30000 },
);
assert.equal(restoredPage, compiledPage);
write("jsnes-v3-readable.html", readable);
write("jsnes-v3-roadroller-base122.html", packed);
write("roadroller-payload.bin", binary);
// Remove obsolete intermediate names from earlier packaging attempts.
for (const name of [
  "base122.loader.js",
  "closure.page.js",
  "jsnes-v2-readable.html",
  "jsnes-v2-roadroller-base122.html",
]) {
  fs.rmSync(path.join(out, name), { force: true });
}
write(
  "metadata.json",
  JSON.stringify(
    {
      pipeline: [
        "Closure SIMPLE: core, ROM reader and UI in one scope",
        "Closure ADVANCED: full-page writer",
        "Roadroller JS/eval",
        "Roadroller six-bit stream packed to bytes, BASE122 encoded",
        "Raw BASE122 HTML attribute plus decoder",
      ],
      closure: "20261108.0.0",
      roadroller: "2.1.0",
      romFormats: [
        ".nes",
        ".zip (single-ROM, stored/deflate)",
        ".7z (single-file LZMA/LZMA2)",
      ],
      parameters,
      readableBytes: Buffer.byteLength(readable),
      closureJsBytes: Buffer.byteLength(compiled),
      closurePageOutputBytes: Buffer.byteLength(writer),
      roadrollerBinaryBytes: binary.length,
      base122PayloadBytes: Buffer.byteLength(payload),
      finalHtmlBytes: Buffer.byteLength(packed),
      sha256: crypto.createHash("sha256").update(packed).digest("hex"),
      base122RoundTrip: "passed",
      fullPageRoundTrip: "passed",
      payloadEmbedding:
        "raw HTML attribute; no payload substitution or JS escapes",
      buildInputs: [
        "example/base122.mjs",
        "example/build-v3.mjs",
        "example/nes-player.html",
        "example/nes-player.js",
        "example/rom-loader.js",
        "package.json",
        "source/jsnes.js",
      ].map((name) => ({
        name,
        sha256: sha256(
          fs.readFileSync(
            name === "source/jsnes.js"
              ? path.join(out, name)
              : path.join(root, name),
          ),
        ),
      })),
    },
    null,
    2,
  ) + "\n",
);
const sums = [
  "jsnes-v3-roadroller-base122.html",
  "jsnes-v3-readable.html",
  "metadata.json",
].map((name) => `${sha256(fs.readFileSync(path.join(out, name)))}  ${name}`);
write("SHA256SUMS", `${sums.join("\n")}\n`);
write(
  "README.md",
  `# JSNES standalone V3\n\nV3 adds ZIP support to the local ROM picker. It contains a readable standalone HTML and a compact Roadroller + BASE122 standalone HTML for offline use in a modern browser.\n\n## Files\n\n- \`jsnes-v3-roadroller-base122.html\`: compact standalone build.\n- \`jsnes-v3-readable.html\`: readable standalone build.\n- \`metadata.json\`: build parameters, sizes, input hashes, and format notes.\n- \`SHA256SUMS\`: hashes for the two HTML artifacts and metadata.\n- \`source/jsnes.js\`: JSNES core snapshot used by this build.\n\nOpen either HTML file and choose a local ROM. Supported inputs are raw \`.nes\`, \`.7z\` containing one LZMA/LZMA2 file, and \`.zip\` containing exactly one \`.nes\` entry using stored or Deflate compression. ZIP64, encrypted, split, and multi-ROM ZIP files are not supported. The extracted ROM limit is 16 MiB; archive input is limited to 64 MiB. ZIP Deflate needs browser support for \`DecompressionStream('deflate-raw')\`.\n\nThe build checks BASE122 decoding and complete page restoration. Browser ROM-loading verification is not included in this release.\n`,
);
console.log(
  `V3 built: ${Buffer.byteLength(packed)} bytes; readable: ${Buffer.byteLength(readable)} bytes`,
);
