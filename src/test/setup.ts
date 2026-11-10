import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";
import { DEFAULT_LOCALE, setLocale } from "../lib/i18n";
import { DEFAULT_THEME, setTheme } from "../lib/theme";
import { FakeEventSource } from "./fakeEventSource";

// The first render of the whole app in a test file can take over a second on a busy machine
// (all files run in parallel): give findBy/waitFor more time than the default 1 s.
configure({ asyncUtilTimeout: 3000 });

afterEach(async () => {
  // Before unmounting: a thread view that unmounts saves its inline reply, which would reach
  // the next test's mock server. Imported here, not at the top: the API client must load after
  // the Request patch below.
  const [{ useCompose }, { resetSessions }] = await Promise.all([
    import("../state/compose"),
    import("../features/compose/session"),
  ]);
  useCompose.setState({ windows: [], inline: null });
  resetSessions();
  cleanup();
  FakeEventSource.instances.length = 0;
  // Every test starts in the default language (English), as a new user does.
  setLocale(DEFAULT_LOCALE);
  setTheme(DEFAULT_THEME);
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
