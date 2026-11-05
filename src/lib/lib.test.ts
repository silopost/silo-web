import { describe, expect, it } from "vitest";
import { patchLabelIds } from "../api/mutations/cache";
import { formatListDate, formatSize } from "./format";
import { t } from "./i18n";
import { sanitize } from "./messageHtml";
import { plural } from "./plural";

describe("plural", () => {
  it("uses Polish forms", () => {
    const f = (n: number) => plural(n, "wątek", "wątki", "wątków");
    expect([1, 2, 4, 5, 12, 14, 22, 25].map(f)).toEqual([
      "wątek",
      "wątki",
      "wątki",
      "wątków",
      "wątków",
      "wątków",
      "wątki",
      "wątków",
    ]);
    expect(t.done.archive(1)).toBe("Wątek zarchiwizowany");
    expect(t.done.archive(3)).toBe("3 wątki zarchiwizowane");
    expect(t.done.archive(5)).toBe("5 wątków zarchiwizowanych");
  });
});

describe("format", () => {
  it("formats list dates as in Gmail", () => {
    const now = new Date(2026, 10, 5, 12, 0);
    expect(formatListDate(new Date(2026, 10, 5, 9, 12).toISOString(), now)).toBe("09:12");
    expect(formatListDate(new Date(2026, 10, 4, 9, 12).toISOString(), now)).toBe("4 lis");
    expect(formatListDate(new Date(2025, 10, 4, 9, 12).toISOString(), now)).toBe("04.11.2025");
  });

  it("formats sizes", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(284113)).toBe("277 KB");
    expect(formatSize(3 * 1024 * 1024)).toBe("3,0 MB");
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
