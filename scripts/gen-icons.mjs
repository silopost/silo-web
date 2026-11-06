// Draws the PWA icons of silo-web (public/icons): a white grain silo on the primary blue.
// No image library: shapes are rasterised with 4x4 supersampling and written as PNG with
// node:zlib. Run `node scripts/gen-icons.mjs` after changing the design; the output is committed.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");
const BLUE = [0x0b, 0x57, 0xd0];
const WHITE = [0xff, 0xff, 0xff];

/** The silo in a 0..1 square: a dome on a body, with two bands; `s` scales around the centre. */
function silo(x, y, s) {
  const u = (x - 0.5) / s + 0.5;
  const v = (y - 0.5) / s + 0.5;
  const left = 0.3,
    right = 0.7,
    top = 0.38,
    bottom = 0.82,
    r = (right - left) / 2;
  const inBody = u >= left && u <= right && v >= top && v <= bottom;
  const inDome = (u - 0.5) ** 2 + (v - top) ** 2 <= r * r && v <= top;
  const band = (v > 0.52 && v < 0.56) || (v > 0.66 && v < 0.7);
  return (inBody && !band) || inDome;
}

/** Rounded square of the "any" icons; the maskable one fills the whole square. */
function inBackground(x, y, rounded) {
  if (!rounded) return true;
  const r = 0.22;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function render(size, { rounded, scale }) {
  const px = Buffer.alloc(size * size * 4);
  const n = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0,
        fg = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const fx = (x + (sx + 0.5) / n) / size;
          const fy = (y + (sy + 0.5) / n) / size;
          if (!inBackground(fx, fy, rounded)) continue;
          bg++;
          if (silo(fx, fy, scale)) fg++;
        }
      }
      const a = bg / (n * n);
      const f = bg ? fg / bg : 0;
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(BLUE[c] * (1 - f) + WHITE[c] * f);
      px[i + 3] = Math.round(a * 255);
    }
  }
  return png(size, px);
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, "icon-192.png"), render(192, { rounded: true, scale: 1 }));
writeFileSync(resolve(out, "icon-512.png"), render(512, { rounded: true, scale: 1 }));
// Maskable: full bleed, the silo inside the 80 % safe zone.
writeFileSync(resolve(out, "icon-maskable-512.png"), render(512, { rounded: false, scale: 0.78 }));
// iOS adds its own rounding and ignores transparency.
writeFileSync(resolve(out, "apple-touch-icon.png"), render(180, { rounded: false, scale: 0.9 }));
console.log(`icons written to ${out}`);
