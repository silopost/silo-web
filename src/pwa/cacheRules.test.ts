import { describe, expect, it } from "vitest";
import { isAppNavigation, isCacheableApiRequest } from "./cacheRules";

const origin = "https://silo.example.com";
const cacheable = (path: string, method = "GET", base = origin) =>
  isCacheableApiRequest(new URL(path, base), method, origin);

describe("service worker cache rules", () => {
  it.each([
    "/api/v1/threads?accountId=acc_1&labelId=INBOX&pageSize=50",
    "/api/v1/threads?accountId=acc_1&q=from%3Ajan",
    "/api/v1/threads/t_1",
    "/api/v1/labels?accountId=acc_1",
    "/api/v1/labels/l_1",
    "/api/v1/messages/m_1/html",
  ])("caches GET %s", (path) => {
    expect(cacheable(path)).toBe(true);
  });

  it.each([
    "/api/v1/events",
    "/api/v1/events/poll?since=1",
    "/api/v1/session",
    "/api/v1/sessions",
    "/api/v1/meta",
    "/api/v1/settings",
    "/api/v1/accounts",
    "/api/v1/accounts/acc_1/sync-status",
    "/api/v1/admin/jobs?status=dead",
    "/api/v1/drafts/d_1",
    "/api/v1/attachments/a_1",
    "/api/v1/messages/m_1/raw",
    "/api/v1/threads/t_1/snooze",
    "/api/v1/search/suggest?q=a",
    "/api/v1/contacts/autocomplete?q=a",
    "/u/0/inbox",
  ])("does not cache GET %s", (path) => {
    expect(cacheable(path)).toBe(false);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "HEAD"])("never caches %s", (method) => {
    expect(cacheable("/api/v1/threads/t_1", method)).toBe(false);
    expect(cacheable("/api/v1/labels", method)).toBe(false);
  });

  it("ignores other origins", () => {
    expect(cacheable("/api/v1/threads/t_1", "GET", "https://evil.example")).toBe(false);
  });

  it("serves index.html for app routes, not for /api", () => {
    expect(isAppNavigation(new URL("/u/0/inbox/t_1", origin))).toBe(true);
    expect(isAppNavigation(new URL("/login?redirect=%2Fu%2F0", origin))).toBe(true);
    expect(isAppNavigation(new URL("/api/v1/oauth/google/callback?code=x", origin))).toBe(false);
  });
});
