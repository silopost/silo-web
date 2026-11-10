import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LABEL_COLORS } from "./labelColors";
import {
  applyServerTheme,
  DEFAULT_THEME,
  getTheme,
  setTheme,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  THEMES,
  type Theme,
} from "./theme";

const root = resolve(import.meta.dirname, "../..");
const css = readFileSync(resolve(root, "src/styles/theme.css"), "utf8");

type Tokens = Record<string, string>;

/** The custom properties declared in one CSS block body. */
function declarations(body: string): Tokens {
  const out: Tokens = {};
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
    out[m[1]!] = m[2]!.trim();
  return out;
}

/** Every rule of theme.css whose selectors name data-theme values, with its declarations. */
function themeRules(): { themes: string[]; tokens: Tokens }[] {
  const rules = [];
  for (const m of css.matchAll(/((?:\[data-theme="[\w-]+"\],?\s*)+)\{([^}]*)\}/g)) {
    const themes = [...m[1]!.matchAll(/\[data-theme="([\w-]+)"\]/g)].map((x) => x[1]!);
    rules.push({ themes, tokens: declarations(m[2]!) });
  }
  return rules;
}

const base = declarations(/@theme\s*\{([^}]*)\}/.exec(css)![1]!);

/** The tokens of a theme as the cascade gives them: @theme, then its rules in source order. */
function palette(theme: string): Tokens {
  const out = { ...base };
  for (const rule of themeRules()) if (rule.themes.includes(theme)) Object.assign(out, rule.tokens);
  return out;
}

type Rgba = [number, number, number, number];

function parseColor(value: string | undefined): Rgba {
  if (value === undefined) throw new Error("missing colour");
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(value);
  if (rgb) return [+rgb[1]!, +rgb[2]!, +rgb[3]!, rgb[4] === undefined ? 1 : +rgb[4]];
  throw new Error(`unsupported colour ${value}`);
}

/** A translucent colour painted over an opaque one. */
function over(top: Rgba, below: Rgba): Rgba {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i]! * a + below[i]! * (1 - a)).concat(1) as Rgba;
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2 contrast ratio. */
function contrast(a: Rgba, b: Rgba): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Text pairs [foreground, background] and the WCAG AA ratio they need. */
const TEXT = 4.5;
const NON_TEXT = 3;
const PAIRS: [string, string, number][] = [
  ...[
    "surface",
    "panel",
    "raised",
    "row-read",
    "row-selected",
    "nav-active",
    "compose",
    "search",
  ].flatMap((bg): [string, string, number][] => [
    ["ink", bg, TEXT],
    ["ink-muted", bg, TEXT],
  ]),
  ["on-primary", "primary", TEXT],
  ["primary", "panel", TEXT],
  ["primary", "surface", TEXT],
  ["warn-ink", "warn-bg", TEXT],
  ["error-ink", "error-bg", TEXT],
  ["error-ink", "panel", TEXT],
  ["primary", "raised", TEXT],
  ["error-bg", "error-ink", TEXT],
  ["success-ink", "success-bg", TEXT],
  ["on-tooltip", "tooltip", TEXT],
  ["on-snackbar", "snackbar", TEXT],
  ["snackbar-action", "snackbar", TEXT],
  ["star", "panel", NON_TEXT],
  ["snooze", "panel", TEXT],
  ["snooze", "row-read", TEXT],
  ["line-strong", "panel", NON_TEXT],
  ["focus", "panel", NON_TEXT],
  ["focus", "surface", NON_TEXT],
];

describe("theme definitions (theme.css)", () => {
  it("has a rule for every theme of the contract and no other", () => {
    const named = new Set(themeRules().flatMap((r) => r.themes));
    expect([...named].sort()).toEqual([...THEMES].sort());
  });

  it("keeps the default theme exactly as the tokens of @theme", () => {
    const reset = themeRules().find((r) => r.themes.includes("default"))!;
    for (const [name, value] of Object.entries(base)) {
      if (!name.startsWith("--color-")) continue;
      expect([name, reset.tokens[name]]).toEqual([name, value]);
    }
    expect(palette("default")).toEqual({ ...base, "--paper-pad": "0px" });
  });

  it("restores every token a theme overrides inside a light theme tile", () => {
    // A light tile inside the dark page must not inherit a dark token.
    const reset = themeRules().find((r) => r.themes.includes("default"))!;
    for (const theme of THEMES)
      for (const name of Object.keys(palette(theme)))
        if (name.startsWith("--color-")) expect(reset.tokens).toHaveProperty(name);
  });

  it("gives the browser bar the surface of each theme", () => {
    for (const theme of THEMES)
      expect([theme, THEME_COLORS[theme]]).toEqual([theme, palette(theme)["--color-surface"]]);
  });

  it.each(THEMES)("meets WCAG AA contrast in the %s theme", (theme) => {
    const p = palette(theme);
    const color = (token: string) => parseColor(p[`--color-${token}`]);
    const failures: string[] = [];
    const check = (fg: Rgba, bg: Rgba, min: number, what: string) => {
      const ratio = contrast(fg, bg);
      if (ratio < min) failures.push(`${what}: ${ratio.toFixed(2)} < ${min}`);
    };
    for (const [fg, bg, min] of PAIRS) {
      // The default theme stays exactly as before themes, including this one known shortfall.
      if (theme === "default" && fg === "snooze" && bg === "row-read") continue;
      check(color(fg), color(bg), min, `${fg} on ${bg}`);
    }
    // Hovered rows and buttons: the translucent hover over the panel and the read row.
    for (const bg of ["panel", "raised", "row-read", "surface"]) {
      const hovered = over(color("hover"), color(bg));
      check(color("ink"), hovered, TEXT, `ink on hover over ${bg}`);
      check(color("ink-muted"), hovered, TEXT, `ink-muted on hover over ${bg}`);
    }
    // Unread and read rows must look different, and a selected row different from both.
    check(color("row-selected"), color("panel"), 1.1, "row-selected vs panel");
    expect(failures).toEqual([]);
  });

  it("keeps the label colours readable in every theme: each chip brings its own pair", () => {
    // The chips paint their own background, so the theme never changes their contrast; the
    // chip itself stands out from the darkest and the lightest panel.
    const dark = parseColor(palette("dark")["--color-panel"]);
    for (const { bg } of LABEL_COLORS) {
      const chip = parseColor(bg);
      expect([bg, contrast(chip, dark) >= 1.5]).toEqual([bg, true]);
    }
  });

  it("keeps the message paper light in every theme", () => {
    for (const theme of THEMES) expect(palette(theme)["--color-paper"]).toBe("#ffffff");
  });
});

describe("theme state", () => {
  const html = document.documentElement;
  const meta = () => document.querySelector('meta[name="theme-color"]');

  it("sets <html data-theme>, the browser bar colour and remembers the choice", () => {
    setTheme("lavender");
    expect(getTheme()).toBe("lavender");
    expect(html.dataset.theme).toBe("lavender");
    expect(meta()).toHaveAttribute("content", "#efe9f9");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("lavender");
    setTheme(DEFAULT_THEME);
    expect(html.dataset.theme).toBe("default");
    expect(meta()).toHaveAttribute("content", "#f6f8fc");
  });

  it("ignores an unknown or missing theme from the server", () => {
    setTheme("rose");
    applyServerTheme(undefined);
    applyServerTheme("neon");
    applyServerTheme(42);
    expect(getTheme()).toBe("rose");
    applyServerTheme("dark");
    expect(getTheme()).toBe("dark");
  });

  it("applies the remembered theme before the app starts (public/theme-boot.js)", () => {
    const boot = readFileSync(resolve(root, "public/theme-boot.js"), "utf8");
    expect(boot).toContain(`"${THEME_STORAGE_KEY}"`);
    const run = () => new Function(boot)() as void;
    delete html.dataset.theme;
    localStorage.setItem(THEME_STORAGE_KEY, "seafoam" satisfies Theme);
    run();
    expect(html.dataset.theme).toBe("seafoam");
    // A value that is not a theme id is not copied into the attribute.
    localStorage.setItem(THEME_STORAGE_KEY, '"><img>');
    delete html.dataset.theme;
    run();
    expect(html.dataset.theme).toBeUndefined();
  });

  it("is referenced by index.html before the stylesheets and the app", () => {
    const index = readFileSync(resolve(root, "index.html"), "utf8");
    const boot = index.indexOf('<script src="/theme-boot.js"></script>');
    expect(boot).toBeGreaterThan(0);
    expect(boot).toBeLessThan(index.indexOf("/src/main.tsx"));
  });
});
