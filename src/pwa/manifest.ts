/**
 * Web app manifest of silo-web (vite-plugin-pwa writes it as manifest.webmanifest). Colours
 * follow the light theme (src/styles/theme.css: surface and primary).
 */
export const manifest = {
  name: "Silo",
  short_name: "Silo",
  description: "Poczta e-mail Silo",
  lang: "pl",
  start_url: "/",
  scope: "/",
  display: "standalone" as const,
  theme_color: "#f6f8fc",
  background_color: "#f6f8fc",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    {
      src: "/icons/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
    { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
  ],
};
