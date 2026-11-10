// Unread count on the favicon of the tab, as in Gmail: a large red badge with the number of unread
// threads in Inbox over the top right of the brand icon (public/icons/icon.svg). The badge is drawn
// in a 32×32 box so that it stays legible at 16 and 32 px. Its colours are fixed: a favicon is an
// image outside the page, the theme tokens (CSS custom properties) do not reach it.
import baseIcon from "../../public/icons/icon.svg?raw";

/** The text of the badge: none for 0 (no badge), "99+" above 99. */
export function badgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? "99+" : String(Math.floor(count));
}

const BADGE_FILL = "#c5221f";
const BADGE_INK = "#ffffff";
const BADGE_H = 22;
const FONT = 20;

/**
 * The favicon SVG for an unread count: the base icon with the badge, or the base icon unchanged
 * for 0. `base` is the markup of an <svg> element (default: public/icons/icon.svg).
 */
export function faviconSvg(count: number, base: string = baseIcon): string {
  const text = badgeText(count);
  if (!text) return base;
  // The base icon fills the 32×32 box as a nested <svg> (it keeps its own viewBox).
  const inner = base.replace(/^[\s\S]*?<svg\b/, '<svg x="0" y="0" width="32" height="32"');
  const w = text.length === 1 ? BADGE_H : text.length === 2 ? 30 : 32;
  const x = 32 - w;
  // "99+" is squeezed into the badge whatever the width of the font's glyphs.
  const fit = text.length > 2 ? ` textLength="${w - 3}" lengthAdjust="spacingAndGlyphs"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    inner.trim() +
    // A white outline separates the badge from the icon under it.
    `<rect x="${x - 1.5}" y="-1.5" width="${w + 3}" height="${BADGE_H + 3}" rx="${(BADGE_H + 3) / 2}" fill="${BADGE_INK}"/>` +
    `<rect x="${x}" y="0" width="${w}" height="${BADGE_H}" rx="${BADGE_H / 2}" fill="${BADGE_FILL}"/>` +
    `<text x="${x + w / 2}" y="${BADGE_H / 2 + FONT * 0.36}" text-anchor="middle" fill="${BADGE_INK}" ` +
    `font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${FONT}"${fit}>${text}</text>` +
    `</svg>`
  );
}

/** faviconSvg as a data: URL for <link rel="icon">; null for 0 (the original icon). */
export function faviconHref(count: number, base?: string): string | null {
  if (!badgeText(count)) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(faviconSvg(count, base))}`;
}

const ORIGINAL = "data-original-href";

/**
 * Shows the unread count on the <link rel="icon"> of the page (index.html), or its original
 * icon again for 0 (no active account, signed out). The apple-touch icon and the PWA icons stay.
 */
export function setFaviconCount(count: number, doc: Document = document): void {
  const link = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  if (!link.hasAttribute(ORIGINAL)) link.setAttribute(ORIGINAL, link.getAttribute("href") ?? "");
  const href = faviconHref(count) ?? link.getAttribute(ORIGINAL)!;
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
}
