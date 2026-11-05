import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { version } from "../../package.json";
import { api } from "./client";
import { setCsrfToken } from "./csrf";

const seen: Request[] = [];
const server = setupServer(
  http.all("*/api/v1/meta", ({ request }) => {
    seen.push(request.clone());
    return HttpResponse.json({});
  }),
);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  seen.length = 0;
  setCsrfToken(null);
});
afterAll(() => server.close());

it("sends X-Silo-Client on every request and no CSRF header for GET", async () => {
  setCsrfToken("tok");
  await api.GET("/meta");
  expect(seen[0]?.headers.get("x-silo-client")).toBe(`silo-web/${version}`);
  expect(seen[0]?.headers.has("x-silo-csrf")).toBe(false);
});

it("adds X-Silo-CSRF to mutating requests when a token is set", async () => {
  setCsrfToken("tok");
  // /meta has no mutating operation in the schema, so bypass typing with a raw fetch.
  await api.request("POST" as never, "/meta" as never);
  expect(seen[0]?.headers.get("x-silo-csrf")).toBe("tok");
});
