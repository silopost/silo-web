import { useMemo, useRef, useState, type ReactNode } from "react";
import { usePatchSettings, useSettings } from "../../api/queries/settings";
import type { Settings } from "../../api/types";
import { isLocale, LOCALE_NAMES, LOCALES, setLocale, t, useLocale } from "../../lib/i18n";
import { toast } from "../../state/toasts";
import { usePrefs, type Density } from "../../state/ui";
import { Editor } from "../compose/Editor";
import { requestNotificationPermission } from "../notifications/desktop";

const UNDO_SECONDS = [5, 10, 20, 30];

/** The browser's time zone, the default when the server has none. */
const detectedTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function zones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [detectedTimeZone()];
  }
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[14rem_1fr] gap-6 border-b border-line py-4">
      <div>
        <h2 className="font-medium">{title}</h2>
        {hint && <p className="text-sm text-ink-muted">{hint}</p>}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-primary"
      />
      {label}
    </label>
  );
}

/**
 * "General" (plan 5.1 /settings): every change is its own PATCH of that one field; the server
 * validates (422 → snackbar). The density and the language are applied at once, before the
 * answer (a refused language comes back with the settings and switches the UI back).
 */
export function GeneralSettings() {
  const settings = useSettings();
  if (!settings) return <p className="text-ink-muted">{t.loading}</p>;
  return <GeneralForm settings={settings} />;
}

function GeneralForm({ settings }: { settings: Settings }) {
  const patch = usePatchSettings();
  const setDensity = usePrefs((s) => s.setDensity);
  const density = usePrefs((s) => s.density);
  const allZones = useMemo(() => zones(), []);
  const timezone = settings.timezone || detectedTimeZone();
  const signature = useRef(settings.signature);
  const [signatureDirty, setSignatureDirty] = useState(false);

  const save = (p: Partial<Settings>) => patch.mutate(p);
  const locale = useLocale();

  const toggleNotifications = async (on: boolean) => {
    if (!on) return save({ desktopNotifications: false });
    const permission = await requestNotificationPermission();
    if (permission === "unsupported") toast(t.settings.notificationsUnsupported);
    else if (permission !== "granted") toast(t.settings.notificationsDenied);
    else save({ desktopNotifications: true });
  };

  return (
    <div className="max-w-4xl">
      <Row title={t.settings.language}>
        <select
          aria-label={t.settings.language}
          value={locale}
          onChange={(e) => {
            const next = e.target.value;
            if (!isLocale(next)) return;
            setLocale(next);
            save({ language: next });
          }}
          className="w-60 rounded border border-line px-2 py-1"
        >
          {LOCALES.map((l) => (
            <option key={l} value={l} lang={l}>
              {LOCALE_NAMES[l]}
            </option>
          ))}
        </select>
      </Row>
      <Row title={t.settings.density}>
        <div role="radiogroup" aria-label={t.settings.density} className="flex gap-4">
          {(Object.keys(t.densities) as Density[]).map((d) => (
            <label key={d} className="flex items-center gap-2">
              <input
                type="radio"
                name="density"
                value={d}
                checked={density === d}
                onChange={() => {
                  setDensity(d);
                  save({ density: d });
                }}
                className="accent-primary"
              />
              {t.densities[d]}
            </label>
          ))}
        </div>
      </Row>
      <Row title={t.settings.undoSend}>
        <label className="flex items-center gap-2">
          {t.settings.undoSendPeriod}
          <select
            value={settings.undoSendSeconds}
            onChange={(e) => save({ undoSendSeconds: Number(e.target.value) })}
            className="rounded border border-line px-2 py-1"
          >
            {UNDO_SECONDS.map((s) => (
              <option key={s} value={s}>
                {t.settings.seconds(s)}
              </option>
            ))}
          </select>
        </label>
      </Row>
      <Row title={t.settings.signature}>
        <div className="flex h-48 flex-col rounded border border-line">
          <Editor
            id="settings-signature"
            label={t.settings.signature}
            content={settings.signature}
            loadSeq={0}
            onChange={(html) => {
              signature.current = html;
              setSignatureDirty(true);
            }}
          />
        </div>
        <button
          type="button"
          disabled={!signatureDirty}
          onClick={() => {
            setSignatureDirty(false);
            save({ signature: signature.current });
          }}
          className="self-start rounded-full bg-primary px-4 py-1.5 font-medium text-white disabled:opacity-50"
        >
          {t.settings.signatureSave}
        </button>
      </Row>
      <Row title={t.settings.timezone} hint={t.settings.timezoneDetected(detectedTimeZone())}>
        <select
          aria-label={t.settings.timezone}
          value={timezone}
          onChange={(e) => save({ timezone: e.target.value })}
          className="w-80 rounded border border-line px-2 py-1"
        >
          {!allZones.includes(timezone) && <option value={timezone}>{timezone}</option>}
          {allZones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </Row>
      <Row title={t.settings.shortcuts}>
        <Toggle
          label={t.settings.shortcutsOn}
          checked={settings.keyboardShortcutsEnabled}
          onChange={(v) => save({ keyboardShortcutsEnabled: v })}
        />
      </Row>
      <Row title={t.settings.conversationView}>
        <Toggle
          label={t.settings.conversationView}
          checked={settings.conversationView}
          onChange={(v) => save({ conversationView: v })}
        />
      </Row>
      <Row title={t.settings.desktopNotifications} hint={t.settings.desktopNotificationsHint}>
        <Toggle
          label={t.settings.desktopNotifications}
          checked={settings.desktopNotifications}
          onChange={(v) => void toggleNotifications(v)}
        />
      </Row>
    </div>
  );
}
