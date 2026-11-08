import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { applyServerLocale, getLocale, getT, LOCALE_STORAGE_KEY, setLocale, t, useT } from "./i18n";
import { en } from "./messages/en";
import { pl } from "./messages/pl";

/** Every key path of a dictionary, with the kind of its value ("string", "function", "object"). */
function shape(o: object, prefix = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? shape(v as object, `${prefix}${k}.`)
      : [`${prefix}${k}:${typeof v}`],
  );
}

describe("dictionaries", () => {
  it("pl has exactly the keys of en, with the same kinds of values", () => {
    // The Messages type checks most of it; Record<string, string> maps it does not.
    expect(shape(pl).sort()).toEqual(shape(en).sort());
  });

  it("has no empty strings and functions that accept the same arguments", () => {
    const strings = shape(pl).filter((p) => p.endsWith(":string"));
    for (const path of strings) {
      const value = path
        .slice(0, path.lastIndexOf(":"))
        .split(".")
        .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], pl);
      expect(value, path).not.toBe("");
    }
    expect(pl.rateLimited.length).toBe(en.rateLimited.length);
    expect(pl.operationFailed("move", 2)).toContain("2");
  });
});

describe("locale", () => {
  it("defaults to English, switches at once and remembers the choice", () => {
    expect(getLocale()).toBe("en");
    expect(t.inboxTitle).toBe("Inbox");
    setLocale("pl");
    expect(t.inboxTitle).toBe("Odebrane");
    expect(getT().inboxTitle).toBe("Odebrane");
    expect(document.documentElement.lang).toBe("pl");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("pl");
    applyServerLocale("de");
    expect(getLocale()).toBe("pl");
    applyServerLocale("en");
    expect(t.inboxTitle).toBe("Inbox");
    expect(document.documentElement.lang).toBe("en");
  });

  it("re-renders components that use useT", () => {
    function Title() {
      return <h1>{useT().settingsTitle}</h1>;
    }
    render(<Title />);
    expect(screen.getByRole("heading")).toHaveTextContent("Settings");
    act(() => setLocale("pl"));
    expect(screen.getByRole("heading")).toHaveTextContent("Ustawienia");
  });
});
