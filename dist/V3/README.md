# JSNES standalone V3

V3 adds ZIP support to the local ROM picker. It contains a readable standalone HTML and a compact Roadroller + BASE122 standalone HTML for offline use in a modern browser.

## Files

- `jsnes-v3-roadroller-base122.html`: compact standalone build.
- `jsnes-v3-readable.html`: readable standalone build.
- `metadata.json`: build parameters, sizes, input hashes, and format notes.
- `SHA256SUMS`: hashes for the two HTML artifacts and metadata.
- `source/jsnes.js`: JSNES core snapshot used by this build.

Open either HTML file and choose a local ROM. Supported inputs are raw `.nes`, `.7z` containing one LZMA/LZMA2 file, and `.zip` containing exactly one `.nes` entry using stored or Deflate compression. ZIP64, encrypted, split, and multi-ROM ZIP files are not supported. The extracted ROM limit is 16 MiB; archive input is limited to 64 MiB. ZIP Deflate needs browser support for `DecompressionStream('deflate-raw')`.

The build checks BASE122 decoding and complete page restoration. Browser ROM-loading verification is not included in this release.
