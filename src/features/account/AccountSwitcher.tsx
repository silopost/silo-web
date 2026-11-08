import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { api } from "../../api/client";
import { setCsrfToken } from "../../api/csrf";
import { call } from "../../api/errors";
import type { Account } from "../../api/types";
import { Avatar } from "../../components/Avatar";
import { Icon } from "../../components/Icon";
import { t } from "../../lib/i18n";
import { clearOfflineData } from "../../pwa/offlineCache";
import {
  useAccountIndex,
  useAccounts,
  useActiveAccount,
  useInboxUnread,
  useSession,
  useSwitchAccount,
} from ".";

const menuItem =
  "flex cursor-pointer items-center gap-3 rounded px-3 py-2 outline-none data-[highlighted]:bg-hover";

/** Sync problem of an account worth showing in the switcher (plan 3.5.2). */
function stateProblem(a: Account): string | null {
  if (a.state === "auth_failed") return t.switcher.authFailed;
  if (a.state === "backoff") return t.switcher.offline;
  return null;
}

/**
 * AccountSwitcher (plan 6.3): the avatar opens a menu with the user's accounts, the unread
 * count of each account's INBOX, its sync problem, "Add account", "Manage accounts",
 * "Administracja" (admins only) and "Wyloguj". The avatar's badge sums the unread threads
 * of the other accounts. Radix gives the menu role="menu", arrow keys and Esc.
 */
export function AccountSwitcher() {
  const session = useSession();
  const active = useActiveAccount();
  const accounts = useAccounts();
  const unread = useInboxUnread(accounts);
  const switchTo = useSwitchAccount();
  const index = useAccountIndex();
  const { label } = useParams({ strict: false }) as { label?: string };
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: () => call(api.DELETE("/session")),
    onSettled: async () => {
      setCsrfToken(null);
      qc.clear();
      await clearOfflineData();
      await navigate({ to: "/login" });
    },
  });
  const user = session?.user;
  if (!user) return null;

  const others = accounts
    .filter((a) => a.id !== active?.id)
    .reduce((sum, a) => sum + (unread[a.id] ?? 0), 0);
  const current = active ?? accounts[0];
  const triggerLabel = [
    `${t.accountMenu}: ${current?.email ?? user.email}`,
    others > 0 ? t.switcher.otherUnread(others) : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={triggerLabel}
        className="relative ml-2 rounded-full p-1 hover:bg-hover"
        style={{ "--avatar-size": "32px" } as CSSProperties}
      >
        <Avatar
          address={{
            email: current?.email ?? user.email,
            name: current?.displayName || user.displayName,
          }}
        />
        {others > 0 && (
          <span
            aria-hidden="true"
            data-testid="switcher-badge"
            className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-error-ink px-1 text-center text-[10px] leading-4 font-medium text-white"
          >
            {others > 99 ? "99+" : others}
          </span>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" className="z-50 w-80 rounded-lg bg-panel p-1 shadow-lg">
          <div className="px-3 py-2">
            <div className="font-medium">{user.displayName || user.email}</div>
            <div className="text-ink-muted">{user.email}</div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.RadioGroup
            value={current?.id ?? ""}
            onValueChange={(id) => {
              const target = accounts.find((a) => a.id === id);
              if (target && target.id !== current?.id) switchTo(target, label);
            }}
          >
            {accounts.map((a) => {
              const n = unread[a.id] ?? 0;
              const problem = stateProblem(a);
              return (
                <DropdownMenu.RadioItem
                  key={a.id}
                  value={a.id}
                  aria-label={[a.email, t.switcher.unread(n), problem ?? ""]
                    .filter(Boolean)
                    .join(", ")}
                  className={menuItem}
                  style={{ "--avatar-size": "28px" } as CSSProperties}
                >
                  <Avatar address={{ email: a.email, name: a.displayName }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.displayName || a.email}</span>
                    {a.displayName && (
                      <span className="block truncate text-sm text-ink-muted">{a.email}</span>
                    )}
                  </span>
                  {problem && (
                    <span title={problem} className="text-warn-ink">
                      <Icon name={a.state === "auth_failed" ? "error" : "cloudOff"} size={18} />
                    </span>
                  )}
                  {n > 0 && <span className="text-sm font-medium">{n}</span>}
                  <DropdownMenu.ItemIndicator className="text-primary">
                    ✓
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              );
            })}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item
            className={menuItem}
            onSelect={() =>
              void navigate({
                to: "/u/$account/settings/accounts",
                params: { account: index },
                search: { add: true },
              })
            }
          >
            <span aria-hidden="true" className="w-7 text-center text-lg">
              +
            </span>
            {t.switcher.addAccount}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={menuItem}
            onSelect={() =>
              void navigate({ to: "/u/$account/settings/accounts", params: { account: index } })
            }
          >
            <span className="w-7 text-center">
              <Icon name="settings" size={18} />
            </span>
            {t.switcher.manage}
          </DropdownMenu.Item>
          {user.isAdmin && (
            <DropdownMenu.Item
              className={menuItem}
              onSelect={() =>
                void navigate({ to: "/u/$account/admin/users", params: { account: index } })
              }
            >
              <span className="w-7 text-center">
                <Icon name="tune" size={18} />
              </span>
              {t.switcher.admin}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={menuItem} onSelect={() => logout.mutate()}>
            {t.signOut}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
