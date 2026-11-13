import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import webpack from "webpack";
import { Packer } from "roadroller";
import { decode, encode, packSixBit } from "./base122.mjs";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist/V4");
const work = path.join(out, "work");
const sourceRoot = path.join(out, "source");
const compiler = path.join(
  root,
  "node_modules/google-closure-compiler-windows/compiler.exe",
);
if (fs.existsSync(path.join(out, "RELEASED.json")))
  throw Error("V4 is finalized; use a new output directory.");

fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(work, { recursive: true });
fs.rmSync(sourceRoot, { recursive: true, force: true });
fs.mkdirSync(sourceRoot, { recursive: true });

// Compile from the live project inputs. The copies under dist/V4/source are
// snapshots for inspection, never the inputs used for this build.
fs.cpSync(path.join(root, "src"), path.join(sourceRoot, "src"), {
  recursive: true,
});
fs.cpSync(path.join(root, "example"), path.join(sourceRoot, "example"), {
  recursive: true,
});

const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const write = (name, data) => fs.writeFileSync(path.join(out, name), data);
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
write(
  "browser.externs.js",
  "/** @externs */\nvar localStorage; globalThis.jsnes; globalThis.jsnes.Browser;\n",
);

const coreOutput = path.join(work, "core");
fs.mkdirSync(coreOutput, { recursive: true });
await new Promise((resolve, reject) => {
  webpack(
    {
      mode: "production",
      entry: path.join(root, "src/index.js"),
      devtool: false,
      output: {
        path: coreOutput,
        filename: "jsnes.js",
        library: { name: "jsnes", type: "umd" },
        globalObject: "globalThis",
        clean: false,
      },
      optimization: { minimize: false },
      performance: { hints: false },
    },
    (error, stats) => {
      if (error) return reject(error);
      if (stats.hasErrors())
        return reject(Error(stats.toString({ all: false, errors: true })));
      resolve();
    },
  );
});
const core = fs.readFileSync(path.join(coreOutput, "jsnes.js"), "utf8");

const template = read("example/nes-player.html");
const romLoader = read("example/rom-loader.js");
const player = read("example/nes-player.js");
const markers = [
  '<script src="../dist/V1/jsnes.js"></script>',
  '<script src="rom-loader.js"></script>',
  '<script src="nes-player.js"></script>',
];
for (const marker of markers) assert.ok(template.includes(marker), marker);
let uiHtml = template;
for (const marker of markers) uiHtml = uiHtml.replace(marker, "");
assert.ok(!/<script\s+src=/i.test(uiHtml));

// The UI markup becomes executable JavaScript and is compiled in the same
// Closure ADVANCED pass as the emulator, ROM loader and player.
const uiWriter = `document.open();document.write(${JSON.stringify(uiHtml)});document.close();`;
const source = `(function(){\n${core}\n${uiWriter}\nconst jsnes=globalThis.jsnes;\n${romLoader}\n${player}\n})();`;
write("closure-advanced.input.js", source);

const compilerArgs = [
  "--compilation_level",
  "ADVANCED",
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
  path.join(out, "closure-advanced.input.js"),
  "--js_output_file",
  path.join(out, "closure-advanced.min.js"),
];
const compiledResult = spawnSync(compiler, compilerArgs, { encoding: "utf8" });
write(
  "closure-advanced.compiler.log",
  (compiledResult.stdout || "") + (compiledResult.stderr || ""),
);
if (compiledResult.error || compiledResult.status !== 0)
  throw compiledResult.error || Error(compiledResult.stderr);
const compiled = fs.readFileSync(
  path.join(out, "closure-advanced.min.js"),
  "utf8",
);
const keyboardCodes = [
  ["KeyX", 0],
  ["KeyZ", 1],
  ["Space", 2],
  ["Enter", 3],
  ["ArrowUp", 4],
  ["ArrowDown", 5],
  ["ArrowLeft", 6],
  ["ArrowRight", 7],
];
for (const [code, button] of keyboardCodes)
  assert.ok(
    new RegExp(`\\"?${code}\\"?\\s*:\\s*${button}`).test(compiled),
    `Closure renamed the dynamic keyboard key ${code}`,
  );

// Human-readable standalone: the interface remains ordinary HTML, with all
// scripts inlined from the live /src and /example inputs.
const readableSource = `(function(){\n${core}\nconst jsnes=globalThis.jsnes;\n${romLoader}\n${player}\n})();`;
let readable = template;
readable = readable.replace(
  markers[0],
  () => `<script>\n${readableSource.replace(/<\/script/gi, "<\\/script")}\n</script>`,
);
for (const marker of markers.slice(1)) readable = readable.replace(marker, "");
assert.ok(!/<script\s+src=/i.test(readable));
write("jsnes-v4-readable.html", readable);

// Normal version builds run the Roadroller O1 search from these starting
// parameters, then use the optimized options for the actual compact output.
const startingParameters = {
  modelRecipBaseCount: 50,
  modelMaxCount: 4,
  dynamicModels: 0,
  numAbbreviations: 0,
  sparseSelectors: [0, 1, 3, 6, 7, 13, 25, 57, 103, 321, 327, 399],
  recipLearningRate: 1500,
};
const packer = new Packer(
  [{ data: compiled, type: "js", action: "eval" }],
  startingParameters,
);
const optimization = await packer.optimize(1);
const optimizedParameters = {
  ...startingParameters,
  ...optimization.best,
};
const decoder = packer.makeDecoder();
assert.ok(decoder.firstLine.startsWith('eval(Function("[M=\''));
const returnPacker = new Packer(
  [{ data: compiled, type: "js", action: "return" }],
  optimizedParameters,
);
const returnDecoder = returnPacker.makeDecoder();
const roadrollerRoundTrip = Function("code", "return eval(code)")(
  `var unused${returnDecoder.freeVars.map((name) => `,${name}`).join("")};${returnDecoder.firstLine}${returnDecoder.secondLine}`,
);
assert.equal(typeof roadrollerRoundTrip, "string");
new vm.Script(roadrollerRoundTrip);
const stream = decoder.firstLine.slice(
  decoder.firstLine.indexOf("'") + 1,
  decoder.firstLine.lastIndexOf("'"),
);
const binary = packSixBit(stream);
const payload = encode(binary);
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
const loaderInput = `const decode=${decode.toString()};(()=>{const data=decode(document.getElementById("b122").getAttribute("data-payload"));(0,eval)(Function("[M"${second}})();`;
write("base122-loader.input.js", loaderInput);
const loaderOutput = path.join(out, "base122-loader.min.js");
const loaderResult = spawnSync(
  compiler,
  [
    "--compilation_level",
    "ADVANCED",
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
    path.join(out, "base122-loader.input.js"),
    "--js_output_file",
    loaderOutput,
  ],
  { encoding: "utf8" },
);
write(
  "base122-loader.compiler.log",
  (loaderResult.stdout || "") + (loaderResult.stderr || ""),
);
if (loaderResult.error || loaderResult.status !== 0)
  throw loaderResult.error || Error(loaderResult.stderr);
const loader = fs.readFileSync(loaderOutput, "utf8");
new vm.Script(loader);

// Concatenation preserves every Base122 character literally in the attribute.
const packed =
  '<!doctype html><meta charset="utf-8"><script id="b122" data-payload="' +
  payload +
  '">' +
  loader +
  "</script>";
write("jsnes-v4-roadroller-base122.html", packed);
write("roadroller-payload.bin", binary);

const hashTree = (directory) => {
  const entries = [];
  const walk = (current, prefix = "") => {
    for (const item of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = path.posix.join(prefix, item.name);
      const absolute = path.join(current, item.name);
      if (item.isDirectory()) walk(absolute, relative);
      else entries.push({ name: relative, sha256: sha256(fs.readFileSync(absolute)) });
    }
  };
  walk(directory);
  return entries;
};
const metadata = {
  version: "V4",
  buildInputs: { source: hashTree(path.join(root, "src")), example: hashTree(path.join(root, "example")) },
  sourceSnapshot: "dist/V4/source/{src,example}; byte-for-byte copies of build inputs",
  pipeline: [
    "Webpack bundle from root /src (unminified)",
    "Convert example/nes-player.html markup to a document.write JavaScript script",
    "Compile emulator bundle, UI writer, ROM loader and player together with Closure ADVANCED",
    "Roadroller JS/eval compression",
    "Pack Roadroller six-bit stream into bytes and encode with BASE122",
    "Inline Base122 decoder and payload into runnable HTML",
  ],
  compiler: "Closure Compiler 20261108.0.0",
  closurePassesPerBuild: {
    applicationBundle: 1,
    base122Loader: 1,
    applicationIsNotRecompiled: true,
  },
  roadroller: "2.1.0",
  roadrollerOptimizationSearch: "O1",
  roadrollerOptimizationElapsedMs: Math.round(optimization.elapsedMsecs),
  roadrollerOptimizationEstimateBytes: optimization.bestSize,
  roadrollerOptimizationBest: optimization.best,
  roadrollerStartingParameters: startingParameters,
  roadrollerParameters: optimizedParameters,
  sizesBytes: {
    webpackCore: Buffer.byteLength(core),
    combinedClosureInput: Buffer.byteLength(source),
    closureAdvancedJs: Buffer.byteLength(compiled),
    readableHtml: Buffer.byteLength(readable),
    roadrollerBinary: binary.length,
    base122Payload: Buffer.byteLength(payload),
    base122LoaderJs: Buffer.byteLength(loader),
    compactHtml: Buffer.byteLength(packed),
  },
  sha256: {
    readableHtml: sha256(readable),
    compactHtml: sha256(packed),
    closureAdvancedJs: sha256(compiled),
  },
  checks: {
    roadrollerDecodeSyntax: "passed",
    base122RoundTrip: "passed",
    base122LoaderSyntax: "passed",
    closureAdvancedCompile: "passed",
    keyboardEventCodeKeysPreserved: "passed",
    browserRomSmokeTest: "not run",
  },
};
write("metadata.json", JSON.stringify(metadata, null, 2) + "\n");
const sums = [
  "jsnes-v4-roadroller-base122.html",
  "jsnes-v4-readable.html",
  "metadata.json",
].map((name) => `${sha256(fs.readFileSync(path.join(out, name)))}  ${name}`);
write("SHA256SUMS", `${sums.join("\n")}\n`);
write(
  "README.md",
  [
    "# JSNES standalone V4",
    "",
    "V4 packages the current root src/ and example/ trees into standalone HTML files. The build copies byte-for-byte snapshots of both input trees into source/src/ and source/example/.",
    "",
    "## Build pipeline",
    "",
    "1. Bundle src/ with webpack without minification.",
    "2. Convert the player HTML markup into a JavaScript document.write script.",
    "3. Compile the emulator, HTML writer, ROM loader and player together in one Closure ADVANCED pass.",
    "4. Run Roadroller O1 parameter search from the recorded starting parameters and use its best parameters to compress the result.",
    "5. Encode the Roadroller binary with BASE122 and inline the decoder and payload into a standalone HTML file.",
    "",
    "## Files",
    "",
    "- jsnes-v4-roadroller-base122.html: compact standalone player.",
    "- jsnes-v4-readable.html: readable standalone player with inlined scripts.",
    "- source/: byte-for-byte source snapshots from the build inputs.",
    "- metadata.json and SHA256SUMS: sizes, tool versions, inputs and hashes.",
    "",
    "Open either HTML file in a modern browser and select a local ROM. Supported inputs are raw .nes, .7z containing one LZMA/LZMA2 file, and .zip containing one .nes entry using stored or Deflate compression. ROMs are limited to 16 MiB and archive files to 64 MiB. ZIP64, encrypted, split, and multi-ROM ZIP files are not supported. ZIP Deflate requires browser support for DecompressionStream('deflate-raw').",
    "",
    "The build verifies Closure compilation, keyboard key-name preservation, Roadroller decoder syntax, and BASE122 round-trip decoding. Browser ROM loading and gameplay were not tested for this release.",
    "",
  ].join("\n"),
);
console.log(JSON.stringify(metadata.sizesBytes, null, 2));
