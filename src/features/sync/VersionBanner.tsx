import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { metaQuery } from "../../api/queries/meta";
import { t } from "../../lib/i18n";
import { compareVersions } from "../../lib/semver";
import { usePwa } from "../../state/pwa";
import { versionConfig } from "./version";

/** GET /meta again every 15 minutes (and after each SSE reconnect, events.ts). */
const RECHECK_MS = 15 * 60_000;

/**
 * "A new version is available · Refresh" when this silo-web is older than meta.minWebVersion
 * (plan 2.4), "The server was updated · Refresh" when serverVersion changed while the
 * page is open, "A new version of the app is ready · Refresh" when the service worker has a newer
 * build waiting (PWA, registerType "prompt"; the click activates it). Informational: the app
 * keeps working until the user reloads.
 */
export function VersionBanner() {
  const meta = useQuery({ ...metaQuery, refetchInterval: RECHECK_MS }).data;
  const pwa = usePwa();
  // The server version this page started with.
  const [initial, setInitial] = useState<string | null>(meta?.serverVersion ?? null);
  if (initial === null && meta) setInitial(meta.serverVersion);
  let text: string | null = null;
  let reload = () => versionConfig.reload();
  if (pwa.needRefresh) {
    text = t.versionBanner.appReady;
    reload = pwa.update;
  } else if (!meta) return null;
  else if (compareVersions(versionConfig.appVersion, meta.minWebVersion) < 0)
    text = t.versionBanner.newVersion;
  else if (initial !== null && meta.serverVersion !== initial) text = t.versionBanner.serverUpdated;
  if (!text) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 bg-primary px-4 py-1.5 text-sm text-white"
    >
      <span>{text}</span>
      <span aria-hidden="true">·</span>
      <button type="button" onClick={reload} className="font-medium underline">
        {t.versionBanner.reload}
      </button>
    </div>
  );
}
