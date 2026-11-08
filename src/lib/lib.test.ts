import { describe, expect, it } from "vitest";
import { patchLabelIds } from "../api/mutations/cache";
import { isValidEmail, parseAddresses } from "./addresses";
import { formatCount, formatListDate, formatSize } from "./format";
import { setLocale, t } from "./i18n";
import { sanitize } from "./messageHtml";
import { sanitizePastedHtml } from "./pasteHtml";
import { plural } from "./plural";

describe("plural", () => {
  it("uses the CLDR forms of each language", () => {
    const f = (n: number) =>
      plural("pl", n, { one: "wątek", few: "wątki", many: "wątków", other: "wątku" });
    expect([1, 2, 4, 5, 12, 14, 22, 25, 0].map(f)).toEqual([
      "wątek",
      "wątki",
      "wątki",
      "wątków",
      "wątków",
      "wątków",
      "wątki",
      "wątków",
      "wątków",
    ]);
    const e = (n: number) => plural("en", n, { one: "thread", other: "threads" });
    expect([0, 1, 2, 21].map(e)).toEqual(["threads", "thread", "threads", "threads"]);
    expect(t.done.archive(1)).toBe("Conversation archived");
    expect(t.done.archive(3)).toBe("3 conversations archived");
    setLocale("pl");
    expect(t.done.archive(1)).toBe("Wątek zarchiwizowany");
    expect(t.done.archive(3)).toBe("3 wątki zarchiwizowane");
    expect(t.done.archive(5)).toBe("5 wątków zarchiwizowanych");
  });
});

describe("format", () => {
  it("formats list dates as in Gmail", () => {
    const now = new Date(2026, 10, 5, 12, 0);
    const list = (d: Date) => formatListDate(d.toISOString(), now);
    expect(list(new Date(2026, 10, 5, 9, 12))).toBe("9:12 AM");
    expect(list(new Date(2026, 10, 4, 9, 12))).toBe("Nov 4");
    expect(list(new Date(2025, 10, 4, 9, 12))).toBe("11/4/25");
    setLocale("pl");
    expect(list(new Date(2026, 10, 5, 9, 12))).toBe("09:12");
    expect(list(new Date(2026, 10, 4, 9, 12))).toBe("4 lis");
    expect(list(new Date(2025, 10, 4, 9, 12))).toBe("04.11.2025");
  });

  it("formats sizes and counts", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(284113)).toBe("277 KB");
    expect(formatSize(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(formatCount(12345)).toBe("12,345");
    setLocale("pl");
    expect(formatSize(3 * 1024 * 1024)).toBe("3,0 MB");
    expect(formatCount(12345)).toBe("12 345");
  });
});

describe("optimistic labels", () => {
  it("applies archive, trash and read", () => {
    expect(patchLabelIds(["INBOX", "UNREAD"], [], ["INBOX"])).toEqual(["UNREAD"]);
    expect(patchLabelIds(["INBOX", "l_1"], ["TRASH"], [])).toEqual(["l_1", "TRASH"]);
    expect(patchLabelIds(["INBOX", "UNREAD"], [], ["UNREAD"])).toEqual(["INBOX"]);
  });
});

describe("sanitize", () => {
  it("removes scripts, handlers and forms and opens links outside", () => {
    const out = sanitize(
      '<a href="https://x.test">x</a><a href="javascript:alert(1)">y</a><form><input></form><img src=x onerror=alert(1)><script>1</script>',
    );
    expect(out).not.toMatch(/script|onerror|javascript:|<form|<input/);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });
});

describe("addresses", () => {
  it("parses typed and pasted lists", () => {
    expect(
      parseAddresses('"Kowalski, Jan" <jan@firma.pl>; Ola <ola@x.pl>, ewa@y.pl\nadam@z.pl b@c.pl'),
    ).toEqual([
      { name: "Kowalski, Jan", email: "jan@firma.pl" },
      { name: "Ola", email: "ola@x.pl" },
      { name: "", email: "ewa@y.pl" },
      { name: "", email: "adam@z.pl" },
      { name: "", email: "b@c.pl" },
    ]);
    expect(parseAddresses(" , ")).toEqual([]);
  });

  it("flags addresses that cannot be right", () => {
    expect(isValidEmail("dev2@silo.test")).toBe(true);
    expect(isValidEmail("root@localhost")).toBe(true);
    expect(isValidEmail("zly-adres")).toBe(false);
    expect(isValidEmail("a b@c.pl")).toBe(false);
  });
});

describe("pasted HTML", () => {
  it("keeps the formats of the editor only", () => {
    const html = sanitizePastedHtml(
      '<div style="color:red"><b onclick="x()">B</b><script>1</script><a href="javascript:x">l</a>' +
        '<table><tr><td>t</td></tr></table><img src="https://x.pl/a.png" onerror="y()"></div>',
    );
    expect(html).toBe('<div><b>B</b><a>l</a>t<img src="https://x.pl/a.png"></div>');
  });
});
