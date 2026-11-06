import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { usePwa } from "../state/pwa";
import { createMockMail } from "../test/mockMail";
import { renderApp } from "../test/renderApp";
import { API_CACHE } from "./cacheRules";
import { manifest } from "./manifest";
import { clearOfflineData, loadOfflineSession, saveOfflineSession } from "./offlineCache";

const root = resolve(import.meta.dirname, "../..");

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  usePwa.setState({ needRefresh: false, update: () => {} });
  vi.unstubAllGlobals();
});
afterAll(() => server.close());

describe("manifest", () => {
  it("describes an installable standalone app", () => {
    expect(manifest).toMatchObject({
      name: "Silo",
      short_name: "Silo",
      start_url: "/",
      display: "standalone",
      theme_color: "#f6f8fc",
      background_color: "#f6f8fc",
    });
    const sizes = manifest.icons.filter((i) => i.type === "image/png").map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("has every icon file, PNGs of the declared size", () => {
    for (const icon of manifest.icons) {
      const file = resolve(root, "public", icon.src.slice(1));
      expect(existsSync(file), icon.src).toBe(true);
      if (icon.type !== "image/png") continue;
      const png = readFileSync(file);
      const [w, h] = icon.sizes.split("x").map(Number);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([w, h]);
    }
  });

  it("index.html links the touch icon; the plugin injects the manifest link", () => {
    const html = readFileSync(resolve(root, "index.html"), "utf8");
    expect(html).toContain('rel="apple-touch-icon" href="/icons/apple-touch-icon.png"');
    expect(existsSync(resolve(root, "public/icons/apple-touch-icon.png"))).toBe(true);
    const config = readFileSync(resolve(root, "vite.config.ts"), "utf8");
    expect(config).toMatch(/registerType: "prompt"/);
    expect(config).toMatch(/strategies: "injectManifest"/);
  });
});

describe("offline data", () => {
  it("keeps a session snapshot without the CSRF token", () => {
    const { session } = createMockMail();
    saveOfflineSession(session);
    expect(localStorage.getItem("silo.offlineSession")).not.toContain("csrf-1");
    expect(loadOfflineSession()).toEqual({ ...session, csrfToken: "" });
  });

  it("clears the API cache and the snapshot", async () => {
    const del = vi.fn(async () => true);
    vi.stubGlobal("caches", { delete: del });
    saveOfflineSession(createMockMail().session);
    await clearOfflineData();
    expect(del).toHaveBeenCalledWith(API_CACHE);
    expect(loadOfflineSession()).toBeNull();
  });

  it("opens the app from the snapshot when the server is unreachable", async () => {
    const mail = createMockMail();
    saveOfflineSession(mail.session);
    server.use(...mail.handlers);
    server.use(http.get("*/api/v1/session", () => HttpResponse.error()));
    renderApp("/u/0/inbox");
    expect(await screen.findByRole("row", { name: /Temat 1/ })).toBeInTheDocument();
  });

  it("without a snapshot an unreachable server still shows the error", async () => {
    const mail = createMockMail();
    server.use(...mail.handlers);
    server.use(http.get("*/api/v1/session", () => HttpResponse.error()));
    renderApp("/u/0/inbox");
    expect(await screen.findByText("Nie można połączyć się z serwerem Silo.")).toBeInTheDocument();
  });

  it("sign-out clears the cached mail", async () => {
    const del = vi.fn(async () => true);
    vi.stubGlobal("caches", { delete: del });
    const mail = createMockMail();
    server.use(...mail.handlers);
    const user = userEvent.setup();
    const { router } = renderApp("/u/0/inbox");
    await user.click(await screen.findByRole("button", { name: /dev1@silo.test/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Wyloguj" }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(del).toHaveBeenCalledWith(API_CACHE);
    expect(loadOfflineSession()).toBeNull();
  });
});

describe("update banner", () => {
  it("offers the waiting service worker", async () => {
    const update = vi.fn();
    usePwa.setState({ needRefresh: true, update });
    server.use(...createMockMail().handlers);
    const user = userEvent.setup();
    renderApp("/u/0/inbox");
    expect(await screen.findByText("Nowa wersja aplikacji gotowa")).toBeInTheDocument();
    const banner = screen.getByText("Nowa wersja aplikacji gotowa").closest("[role=status]");
    await user.click(within(banner as HTMLElement).getByRole("button", { name: "Odśwież" }));
    expect(update).toHaveBeenCalled();
  });
});
