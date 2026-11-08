// Rasterises the brand icon public/icons/icon.svg (the source of truth: a hand-drawn vector of
// the open envelope from silo/docs/brand-icon-reference.png) into the PNG icons of silo-web.
// Uses @resvg/resvg-js (devDependency, prebuilt Rust renderer, no native toolchain needed) so
// the PNGs match the SVG exactly. Run `npm run gen:icons` after changing icon.svg; the output
// is committed.
//   icon-192.png, icon-512.png  purpose "any": transparent background, small margin
//   icon-maskable-512.png       white full-bleed square, icon at 66 % so it stays in the 80 % safe circle
//   apple-touch-icon.png        180 px on white (iOS ignores transparency and rounds itself)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");
const icon = readFileSync(resolve(dir, "icon.svg"));
const href = `data:image/svg+xml;base64,${icon.toString("base64")}`;

/** The icon centred on a `size` px square, scaled to `scale` of it, on `background` (or none). */
function render(size, scale, background) {
  const s = size * scale;
  const o = (size - s) / 2;
  const bg = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${bg}<image href="${href}" x="${o}" y="${o}" width="${s}" height="${s}"/></svg>`;
  return new Resvg(svg).render().asPng();
}

writeFileSync(resolve(dir, "icon-192.png"), render(192, 0.94));
writeFileSync(resolve(dir, "icon-512.png"), render(512, 0.94));
writeFileSync(resolve(dir, "icon-maskable-512.png"), render(512, 0.66, "#ffffff"));
writeFileSync(resolve(dir, "apple-touch-icon.png"), render(180, 0.8, "#ffffff"));
console.log(`icons written to ${dir}`);
