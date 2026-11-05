import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// Node's Request rejects relative URLs, while the API client uses the relative
// base URL "/api/v1". Resolve them against the jsdom origin, as a browser would.
const NativeRequest = globalThis.Request;
globalThis.Request = class extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(
      typeof input === "string" && input.startsWith("/")
        ? new URL(input, window.location.origin).href
        : input,
      init,
    );
  }
};
