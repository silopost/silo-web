/// <reference types="vite-plugin-pwa/client" />

/** Version of silo-web from package.json (vite.config.ts and vitest.config.ts `define`). */
declare const __APP_VERSION__: string;

/** `?raw` imports (Vite): the file's text, e.g. the brand icon for the favicon badge. */
declare module "*?raw" {
  const text: string;
  export default text;
}
