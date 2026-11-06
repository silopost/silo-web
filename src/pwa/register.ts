import { registerSW } from "virtual:pwa-register";
import { usePwa } from "../state/pwa";

/**
 * Registers the service worker of the production build (src/sw.ts). A newer build waiting
 * makes the version banner offer "Nowa wersja aplikacji gotowa · Odśwież"; the click activates
 * it and reloads the page. Imported by main.tsx only (tests run without a service worker).
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const updateSW = registerSW({
    onNeedRefresh: () => usePwa.setState({ needRefresh: true, update: () => void updateSW(true) }),
  });
}
