import { afterEach, describe, expect, it } from "vitest";
import { badgeText, faviconHref, faviconSvg, setFaviconCount } from "./favicon";

const BASE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path d="M0 0"/></svg>';

describe("favicon badge", () => {
  it("shows the count, 99+ above 99 and no badge for 0", () => {
    expect([0, -1, NaN, 1, 27, 99, 100, 5000].map(badgeText)).toEqual([
      null,
      null,
      null,
      "1",
      "27",
      "99",
      "99+",
      "99+",
    ]);
  });

  it("keeps the base icon for 0 and draws a badge over it otherwise", () => {
    expect(faviconSvg(0, BASE)).toBe(BASE);
    expect(faviconHref(0, BASE)).toBeNull();
    for (const [n, text] of [
      [1, "1"],
      [99, "99"],
      [100, "99+"],
    ] as const) {
      const svg = faviconSvg(n, BASE);
      const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
      expect(doc.querySelector("parsererror")).toBeNull();
      const root = doc.documentElement;
      expect(root.getAttribute("viewBox")).toBe("0 0 32 32");
      // The base icon, nested at full size, then the badge.
      const nested = root.querySelector("svg")!;
      expect(nested.getAttribute("viewBox")).toBe("0 0 1024 1024");
      expect(nested.getAttribute("width")).toBe("32");
      expect(root.querySelector("text")!.textContent).toBe(text);
      // Large as in Gmail: about two thirds of the height, the full width for 99+.
      const badge = root.querySelectorAll("rect")[1]!;
      expect(Number(badge.getAttribute("height"))).toBeGreaterThanOrEqual(20);
      if (text === "99+") expect(badge.getAttribute("width")).toBe("32");
      const href = faviconHref(n, BASE)!;
      expect(href.startsWith("data:image/svg+xml")).toBe(true);
      expect(decodeURIComponent(href.slice(href.indexOf(",") + 1))).toBe(svg);
    }
  });

  it("uses public/icons/icon.svg as the default base icon", () => {
    expect(faviconSvg(0)).toContain('viewBox="0 0 1024 1024"');
    expect(faviconSvg(3)).toContain("#F52522");
  });
});

describe("setFaviconCount", () => {
  afterEach(() => {
    document.head.innerHTML = "";
  });

  it("swaps the href of the icon link and restores the original for 0", () => {
    document.head.innerHTML =
      '<link rel="icon" href="/icons/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">';
    const icon = document.querySelector('link[rel="icon"]')!;
    setFaviconCount(27);
    expect(icon.getAttribute("href")).toBe(faviconHref(27));
    setFaviconCount(120);
    expect(icon.getAttribute("href")).toBe(faviconHref(100));
    setFaviconCount(0);
    expect(icon.getAttribute("href")).toBe("/icons/icon.svg");
    expect(document.querySelector('link[rel="apple-touch-icon"]')!.getAttribute("href")).toBe(
      "/icons/apple-touch-icon.png",
    );
  });

  it("does nothing without an icon link", () => {
    expect(() => setFaviconCount(3)).not.toThrow();
  });
});
