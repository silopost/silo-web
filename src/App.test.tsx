import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import App from "./App";
import type { components } from "./api/schema";

const meta = {
  serverVersion: "0.3.0",
  apiVersion: "1",
  minWebVersion: "0.3.0",
  authMode: "imap",
  allowCustomServers: false,
} satisfies components["schemas"]["Meta"];

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it("renders the Silo heading and the server version from GET /meta", async () => {
  server.use(http.get("*/api/v1/meta", () => HttpResponse.json(meta)));
  render(<App />);
  expect(screen.getByRole("heading", { name: "Silo" })).toBeInTheDocument();
  expect(await screen.findByText("Server version 0.3.0")).toBeInTheDocument();
});

it("shows an error when the server is unreachable", async () => {
  server.use(http.get("*/api/v1/meta", () => HttpResponse.error()));
  render(<App />);
  expect(await screen.findByText("Cannot reach the server.")).toBeInTheDocument();
});
