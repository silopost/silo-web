import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Link } from "@tanstack/react-router";
import { usePatchSettings } from "../../api/queries/settings";
import { Brand } from "../../components/Brand";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { t } from "../../lib/i18n";
import { usePrefs, useUi, type Density } from "../../state/ui";
import { useAccountIndex } from "../account";
import { AccountSwitcher } from "../account/AccountSwitcher";
import { SyncStatusIndicator } from "../sync/SyncStatusIndicator";
import { SearchBox } from "../search/SearchBox";

const menuItem =
  "flex cursor-pointer items-center gap-2 rounded px-3 py-2 outline-none data-[highlighted]:bg-hover";
const menuContent = "z-50 min-w-48 rounded-lg bg-panel p-1 shadow-lg";

function DensityMenu() {
  const density = usePrefs((s) => s.density);
  const setDensity = usePrefs((s) => s.setDensity);
  const patch = usePatchSettings();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton icon="density" label={t.density} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" className={menuContent}>
          <DropdownMenu.Label className="px-3 py-1 text-xs text-ink-muted">
            {t.density}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={density}
            onValueChange={(v) => {
              setDensity(v as Density);
              patch.mutate({ density: v });
            }}
          >
            {(Object.keys(t.densities) as Density[]).map((d) => (
              <DropdownMenu.RadioItem key={d} value={d} className={menuItem}>
                <span className="w-4">{density === d ? "✓" : ""}</span>
                {t.densities[d]}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** TopBar (plan 6.3): menu, logo, search, sync status, density, help, AccountSwitcher. */
export function TopBar() {
  const toggleNav = usePrefs((s) => s.toggleNav);
  const collapsed = usePrefs((s) => s.navCollapsed);
  const openHelp = useUi((s) => s.setShortcutsHelpOpen);
  const account = useAccountIndex();
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 px-3">
      <IconButton
        icon="menu"
        label={t.mainMenu}
        aria-expanded={!collapsed}
        onClick={toggleNav}
        size={24}
      />
      <span className="flex w-[180px] pl-2 text-xl text-ink">
        <Brand />
      </span>
      <SearchBox />
      <div className="ml-auto flex items-center gap-1">
        <SyncStatusIndicator />
        <IconButton icon="keyboard" label={t.shortcuts} onClick={() => openHelp(true)} />
        <DensityMenu />
        <Link
          to="/u/$account/settings/general"
          params={{ account }}
          aria-label={t.settingsTitle}
          title={t.settingsTitle}
          className="inline-flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
        >
          <Icon name="settings" size={20} />
        </Link>
        <AccountSwitcher />
      </div>
    </header>
  );
}
