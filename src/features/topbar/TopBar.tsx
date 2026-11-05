import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { api } from "../../api/client";
import { setCsrfToken } from "../../api/csrf";
import { call } from "../../api/errors";
import { Avatar } from "../../components/Avatar";
import { IconButton } from "../../components/IconButton";
import { t } from "../../lib/i18n";
import { usePrefs, useUi, type Density } from "../../state/ui";
import { useActiveAccount, useSession } from "../account";
import { SyncStatusIndicator } from "../sync/SyncStatusIndicator";
import { SearchBox } from "./SearchBox";

const menuItem =
  "flex cursor-pointer items-center gap-2 rounded px-3 py-2 outline-none data-[highlighted]:bg-hover";
const menuContent = "z-50 min-w-48 rounded-lg bg-panel p-1 shadow-lg";

function DensityMenu() {
  const density = usePrefs((s) => s.density);
  const setDensity = usePrefs((s) => s.setDensity);
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
          <DropdownMenu.RadioGroup value={density} onValueChange={(v) => setDensity(v as Density)}>
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

function UserMenu() {
  const session = useSession();
  const account = useActiveAccount();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: () => call(api.DELETE("/session")),
    onSettled: async () => {
      setCsrfToken(null);
      qc.clear();
      await navigate({ to: "/login" });
    },
  });
  const user = session?.user;
  if (!user) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`${t.accountMenu}: ${user.email}`}
        className="ml-2 rounded-full p-1 hover:bg-hover"
        style={{ "--avatar-size": "32px" } as CSSProperties}
      >
        <Avatar address={{ email: user.email, name: user.displayName }} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" className={menuContent}>
          <div className="px-3 py-2">
            <div className="font-medium">{user.displayName || user.email}</div>
            <div className="text-ink-muted">{account?.email ?? user.email}</div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={menuItem} onSelect={() => logout.mutate()}>
            {t.signOut}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** TopBar (plan 6.3): menu, logo, search, sync status, density, help, account menu. */
export function TopBar() {
  const toggleNav = usePrefs((s) => s.toggleNav);
  const collapsed = usePrefs((s) => s.navCollapsed);
  const openHelp = useUi((s) => s.setShortcutsHelpOpen);
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 px-3">
      <IconButton
        icon="menu"
        label={t.mainMenu}
        aria-expanded={!collapsed}
        onClick={toggleNav}
        size={24}
      />
      <span className="w-[180px] pl-2 text-xl text-ink-muted">{t.appName}</span>
      <SearchBox />
      <div className="ml-auto flex items-center gap-1">
        <SyncStatusIndicator />
        <IconButton icon="keyboard" label={t.shortcuts} onClick={() => openHelp(true)} />
        <DensityMenu />
        <UserMenu />
      </div>
    </header>
  );
}
