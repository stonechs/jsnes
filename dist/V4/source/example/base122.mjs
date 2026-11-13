// Kevin Albertson's Base122 format: seven-bit groups, with six unsafe ASCII
// values carried in a two-byte UTF-8 character instead. No JS string escaping.
const illegal = [0, 10, 13, 34, 38, 92];

export function encode(bytes) {
  const groups = [];
  let buffer = 0,
    bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 7) {
      bits -= 7;
      groups.push((buffer >>> bits) & 127);
    }
  }
  if (bits) groups.push((buffer << (7 - bits)) & 127);
  const utf8 = [];
  for (let i = 0; i < groups.length; i++) {
    const value = groups[i],
      index = illegal.indexOf(value);
    if (index < 0) utf8.push(value);
    else {
      const last = i + 1 === groups.length;
      const next = last ? value : groups[++i];
      utf8.push(
        194 | ((last ? 7 : index) << 2) | (next >>> 6),
        128 | (next & 63),
      );
    }
  }
  return Buffer.from(utf8).toString("utf8");
}

export function decode(text) {
  const illegal = [0, 10, 13, 34, 38, 92],
    bytes = [];
  let bits = 0,
    buffer = 0;
  function push(value) {
    buffer = (buffer << 7) | value;
    bits += 7;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
    }
  }
  for (const ch of text) {
    const value = ch.charCodeAt(0);
    if (value > 127 && ((value >>> 8) & 7) !== 7)
      push(illegal[(value >>> 8) & 7]);
    push(value & 127);
  }
  return Uint8Array.from(bytes);
}

export function packSixBit(text) {
  const bytes = [];
  let bits = 0,
    buffer = 0;
  for (const char of text) {
    buffer = (buffer << 6) | (char.charCodeAt(0) & 63);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
    }
  }
  if (bits) bytes.push((buffer << (8 - bits)) & 255);
  return Uint8Array.from(bytes);
}
