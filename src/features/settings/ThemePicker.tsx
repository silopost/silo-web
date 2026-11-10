import { t } from "../../lib/i18n";
import { THEMES, type Theme } from "../../lib/theme";

/**
 * Theme tiles (Gmail "Themes"): one radio per theme, so arrow keys move between them and screen
 * readers announce "Dark, radio button, 2 of 8". Each tile previews the theme with the real
 * tokens: data-theme on the tile scopes that theme's overrides of theme.css to it.
 */
export function ThemePicker({
  value,
  onChange,
}: {
  value: Theme;
  onChange: (theme: Theme) => void;
}) {
  return (
    <div role="radiogroup" aria-label={t.settings.theme} className="flex flex-wrap gap-3">
      {THEMES.map((theme) => {
        const checked = value === theme;
        return (
          <label
            key={theme}
            className="flex w-28 cursor-pointer flex-col items-center gap-1.5 rounded-xl p-1.5 hover:bg-hover has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
          >
            <input
              type="radio"
              name="theme"
              value={theme}
              checked={checked}
              onChange={() => onChange(theme)}
              className="sr-only"
            />
            {/* The ring is in the colours of the page, the preview inside in those of the tile. */}
            <span
              aria-hidden="true"
              className={`w-full rounded-lg ${
                checked ? "ring-2 ring-primary ring-offset-2 ring-offset-panel" : "ring-1 ring-line"
              }`}
            >
              <span
                data-theme={theme}
                className="flex h-16 w-full gap-1 overflow-hidden rounded-lg bg-surface p-1"
              >
                <span className="flex w-5 flex-col gap-1">
                  <span className="h-3 rounded bg-compose" />
                  <span className="h-1.5 rounded-full bg-nav-active" />
                  <span className="h-1.5 rounded-full bg-line" />
                </span>
                <span className="flex flex-1 flex-col gap-1 rounded bg-panel p-1">
                  <span className="h-1.5 w-3/4 rounded-full bg-ink" />
                  <span className="h-1.5 rounded-sm bg-row-read" />
                  <span className="h-1.5 rounded-sm bg-row-selected" />
                  <span className="mt-auto h-1.5 w-1/3 rounded-full bg-primary" />
                </span>
              </span>
            </span>
            <span className={`text-xs ${checked ? "font-medium" : "text-ink-muted"}`}>
              {checked && <span aria-hidden="true">✓ </span>}
              {t.settings.themes[theme]}
            </span>
          </label>
        );
      })}
    </div>
  );
}
