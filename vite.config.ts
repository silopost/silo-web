import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json" with { type: "json" };
import { manifest } from "./src/pwa/manifest";

export default defineConfig({
  // The app compares its version with GET /meta minWebVersion (plan 2.4).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // The router plugin generates src/routeTree.gen.ts from src/routes and must run before react().
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // PWA (plan 1, 7 Faza 5): our own src/sw.ts (injectManifest) so that the cache rules are
    // one tested module (src/pwa/cacheRules.ts); "prompt": the version banner offers the update.
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: false,
      manifest,
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY ?? "http://localhost:8080",
        // Keep the browser's Host: silo-server accepts an Origin equal to the served host, so
        // the dev server and `vite preview` work on any port, not only on SILO_PUBLIC_URL.
        changeOrigin: false,
      },
    },
  },
});
