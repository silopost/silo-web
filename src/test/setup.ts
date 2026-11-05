import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { FakeEventSource } from "./fakeEventSource";

afterEach(() => {
  cleanup();
  FakeEventSource.instances.length = 0;
  localStorage.clear();
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

// jsdom has no layout: give scroll containers a viewport so the virtual list renders rows.
Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 800 });
Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 1000 });
Element.prototype.scrollTo = function scrollTo() {};
window.scrollTo = () => {};
Element.prototype.scrollIntoView = function scrollIntoView() {};

// Radix primitives measure with ResizeObserver; jsdom does not implement it.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom has no EventSource; tests drive the event stream through this fake.
globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
