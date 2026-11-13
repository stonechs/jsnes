# JSNES standalone V4

V4 packages the current root src/ and example/ trees into standalone HTML files. The build copies byte-for-byte snapshots of both input trees into source/src/ and source/example/.

## Build pipeline

1. Bundle src/ with webpack without minification.
2. Convert the player HTML markup into a JavaScript document.write script.
3. Compile the emulator, HTML writer, ROM loader and player together in one Closure ADVANCED pass.
4. Run Roadroller O1 parameter search from the recorded starting parameters and use its best parameters to compress the result.
5. Encode the Roadroller binary with BASE122 and inline the decoder and payload into a standalone HTML file.

## Files

- jsnes-v4-roadroller-base122.html: compact standalone player.
- jsnes-v4-readable.html: readable standalone player with inlined scripts.
- source/: byte-for-byte source snapshots from the build inputs.
- metadata.json and SHA256SUMS: sizes, tool versions, inputs and hashes.

Open either HTML file in a modern browser and select a local ROM. Supported inputs are raw .nes, .7z containing one LZMA/LZMA2 file, and .zip containing one .nes entry using stored or Deflate compression. ROMs are limited to 16 MiB and archive files to 64 MiB. ZIP64, encrypted, split, and multi-ROM ZIP files are not supported. ZIP Deflate requires browser support for DecompressionStream('deflate-raw').

The build verifies Closure compilation, keyboard key-name preservation, Roadroller decoder syntax, and BASE122 round-trip decoding. Browser ROM loading and gameplay were not tested for this release.
