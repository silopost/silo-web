import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { call, isApiError } from "../../api/errors";
import { keys } from "../../api/keys";
import { adminKeys, adminUsersQuery } from "../../api/queries/admin";
import { metaQuery } from "../../api/queries/meta";
import type { AdminUser } from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { FormDialog } from "../../components/FormDialog";
import { Icon } from "../../components/Icon";
import { formatFullDate } from "../../lib/format";
import { t } from "../../lib/i18n";
import { toast } from "../../state/toasts";
import { useSession } from "../account";
import { copyText } from "../security/clipboard";
import { QueryView, StateChip } from "./common";
import { outline, td, th } from "./styles";

const input = "rounded border border-line px-3 py-2";
const menuItem =
  "flex cursor-pointer items-center gap-2 rounded px-3 py-2 outline-none data-[highlighted]:bg-hover";

/** Toast of an admin mutation's failure: 409 admin_self_change / not_available have their own. */
function failure(err: unknown) {
  if (isApiError(err, 409) && err.code === "admin_self_change") toast(t.admin.selfChange);
  else if (isApiError(err, 409) && err.code === "not_available") toast(t.admin.notAvailable);
  else if (!isApiError(err, 429)) toast(t.genericError);
}

/** A random password for "Wygeneruj" (16 characters from a set without look-alikes). */
function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

type Dialog =
  | { kind: "add" }
  | { kind: "temp"; email: string; password: string }
  | { kind: "password" | "totp" | "remove"; user: AdminUser };

/**
 * Administration → Users: every user with their accounts and states; add (mode local),
 * block, admin rights, password and TOTP reset, removal.
 */
export function UsersPanel() {
  const users = useQuery(adminUsersQuery);
  const local = useQuery(metaQuery).data?.authMode === "local";
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => setDialog(null);

  return (
    <div>
      <div className="mb-3 flex items-center gap-4">
        <h2 className="flex-1 text-lg">{t.admin.tabs.users}</h2>
        {local && (
          <button
            type="button"
            onClick={() => setDialog({ kind: "add" })}
            className="rounded-full bg-primary px-4 py-1.5 font-medium text-white"
          >
            {t.admin.addUser}
          </button>
        )}
      </div>
      <QueryView query={users}>
        {(list) => (
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{t.admin.tabs.users}</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t.admin.email}
                </th>
                <th scope="col" className={th}>
                  {t.admin.name}
                </th>
                <th scope="col" className={th}>
                  {t.admin.isAdmin}
                </th>
                <th scope="col" className={th}>
                  {t.admin.disabled}
                </th>
                <th scope="col" className={th}>
                  {t.admin.totp}
                </th>
                <th scope="col" className={th}>
                  {t.admin.accounts}
                </th>
                <th scope="col" className={th}>
                  {t.admin.created}
                </th>
                <th scope="col" className={th}>
                  <span className="sr-only">{t.admin.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <UserRow key={u.id} user={u} local={local} open={setDialog} />
              ))}
            </tbody>
          </table>
        )}
      </QueryView>
      {dialog?.kind === "add" && (
        <AddUserDialog
          onClose={close}
          onCreated={(email, password) =>
            password ? setDialog({ kind: "temp", email, password }) : close()
          }
        />
      )}
      {dialog?.kind === "temp" && (
        <TemporaryPasswordDialog email={dialog.email} password={dialog.password} onClose={close} />
      )}
      {dialog?.kind === "password" && <ResetPasswordDialog user={dialog.user} onClose={close} />}
      {dialog?.kind === "totp" && <ResetTotpDialog user={dialog.user} onClose={close} />}
      {dialog?.kind === "remove" && <RemoveUserDialog user={dialog.user} onClose={close} />}
    </div>
  );
}

function UserRow({
  user,
  local,
  open,
}: {
  user: AdminUser;
  local: boolean;
  open: (d: Dialog) => void;
}) {
  const qc = useQueryClient();
  const self = useSession()?.user.id === user.id;
  const patch = useMutation({
    mutationFn: (body: { disabled?: boolean; isAdmin?: boolean }) =>
      call(api.PATCH("/admin/users/{id}", { params: { path: { id: user.id } }, body })),
    onSuccess: () => toast(t.admin.saved),
    onError: failure,
    onSettled: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
  const yesNo = (v: boolean) => (v ? t.admin.yes : t.admin.no);
  const accounts = user.accounts ?? [];

  return (
    <tr className={user.disabled ? "text-ink-muted" : undefined}>
      <th scope="row" className={`${td} text-left font-medium`}>
        {user.email}
      </th>
      <td className={td}>{user.displayName}</td>
      <td className={td}>{yesNo(user.isAdmin)}</td>
      <td className={td}>{yesNo(user.disabled)}</td>
      <td className={td}>{yesNo(user.totpEnabled)}</td>
      <td className={td}>
        {accounts.length === 0 ? (
          <span className="text-ink-muted">{t.admin.noAccounts}</span>
        ) : (
          <ul className="flex flex-col gap-1">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2" title={a.error ?? ""}>
                <span>{a.email}</span>
                <StateChip state={a.state} />
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className={`${td} whitespace-nowrap`}>{formatFullDate(user.createdAt)}</td>
      <td className={`${td} text-right`}>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label={t.admin.actionsFor(user.email)}
            disabled={patch.isPending}
            className="rounded-full p-1.5 text-ink-muted hover:bg-hover"
          >
            <Icon name="moreVert" size={20} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="z-50 min-w-56 rounded-lg bg-panel p-1 shadow-lg"
            >
              <DropdownMenu.Item
                className={menuItem}
                disabled={self}
                onSelect={() => patch.mutate({ disabled: !user.disabled })}
              >
                {user.disabled ? t.admin.enable : t.admin.disable}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={menuItem}
                disabled={self}
                onSelect={() => patch.mutate({ isAdmin: !user.isAdmin })}
              >
                {user.isAdmin ? t.admin.revokeAdmin : t.admin.grantAdmin}
              </DropdownMenu.Item>
              {local && (
                <DropdownMenu.Item
                  className={menuItem}
                  onSelect={() => open({ kind: "password", user })}
                >
                  {t.admin.resetPassword}
                </DropdownMenu.Item>
              )}
              {user.totpEnabled && (
                <DropdownMenu.Item
                  className={menuItem}
                  onSelect={() => open({ kind: "totp", user })}
                >
                  {t.admin.resetTotp}
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item
                className={menuItem}
                disabled={self}
                onSelect={() => open({ kind: "remove", user })}
              >
                {t.admin.remove}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </td>
    </tr>
  );
}

function AddUserDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (email: string, temporaryPassword?: string) => void;
}) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      call(
        api.POST("/admin/users", {
          body: {
            email: email.trim(),
            isAdmin,
            ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
            ...(password ? { password } : {}),
          },
        }),
      ),
    onSuccess: (created) => {
      toast(t.admin.userCreated(created.email));
      void qc.invalidateQueries({ queryKey: adminKeys.users });
      onCreated(created.email, created.temporaryPassword);
    },
    onError: (err) => {
      if (isApiError(err, 409) && err.code === "user_exists") setError(t.admin.userExists);
      else if (isApiError(err, 409) && err.code === "not_available") setError(t.admin.notAvailable);
      else if (isApiError(err, 422) || isApiError(err, 400)) setError(t.admin.invalidUser);
      else if (!isApiError(err, 429)) setError(t.genericError);
    },
  });
  return (
    <FormDialog
      title={t.admin.addUser}
      description={t.admin.addUserHint}
      submitLabel={t.admin.create}
      busy={create.isPending}
      onSubmit={() => {
        setError(null);
        create.mutate();
      }}
      onClose={onClose}
    >
      <label className="flex flex-col gap-1">
        <span>{t.admin.email}</span>
        <input
          type="email"
          required
          autoFocus
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.admin.displayName}</span>
        <input
          type="text"
          autoComplete="off"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className={input}
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isAdmin}
          onChange={(e) => setIsAdmin(e.target.checked)}
          className="size-4 accent-primary"
        />
        {t.admin.makeAdmin}
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.admin.password}</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="add-user-password-hint"
          className={input}
        />
      </label>
      <p id="add-user-password-hint" className="-mt-2 text-sm text-ink-muted">
        {t.admin.passwordHint}
      </p>
      {error && (
        <p role="alert" className="text-sm text-error-ink">
          {error}
        </p>
      )}
    </FormDialog>
  );
}

/** The generated password of POST /admin/users, shown only this once. */
function TemporaryPasswordDialog({
  email,
  password,
  onClose,
}: {
  email: string;
  password: string;
  onClose: () => void;
}) {
  return (
    <FormDialog
      title={t.admin.tempTitle}
      description={t.admin.tempHint(email)}
      submitLabel={t.security.done}
      onSubmit={onClose}
      onClose={onClose}
    >
      <div className="flex items-center gap-2">
        <code aria-label={t.admin.tempLabel} className="rounded bg-surface px-3 py-2 font-mono">
          {password}
        </code>
        <button type="button" onClick={() => void copyText(password)} className={outline}>
          {t.security.copy}
        </button>
      </div>
    </FormDialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      call(
        api.PATCH("/admin/users/{id}", { params: { path: { id: user.id } }, body: { password } }),
      ),
    onSuccess: () => {
      toast(t.admin.passwordSet(user.email));
      void qc.invalidateQueries({ queryKey: adminKeys.users });
      onClose();
    },
    onError: (err) => {
      if (isApiError(err, 422) || isApiError(err, 400)) setError(t.security.passwordTooShort);
      else failure(err);
    },
  });
  return (
    <FormDialog
      title={t.admin.resetPasswordTitle(user.email)}
      description={t.admin.resetPasswordHint}
      submitLabel={t.admin.savePassword}
      busy={save.isPending}
      onSubmit={() => {
        setError(null);
        save.mutate();
      }}
      onClose={onClose}
    >
      <label htmlFor="admin-new-password">{t.admin.newPassword}</label>
      <div className="-mt-2 flex gap-2">
        <input
          id="admin-new-password"
          // Text: the admin passes the password on and has to read it.
          type="text"
          required
          autoFocus
          minLength={10}
          autoComplete="off"
          spellCheck={false}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`${input} min-w-0 flex-1 font-mono`}
        />
        <button type="button" onClick={() => setPassword(generatePassword())} className={outline}>
          {t.admin.generate}
        </button>
        <button
          type="button"
          disabled={!password}
          onClick={() => void copyText(password)}
          className={outline}
        >
          {t.security.copy}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-error-ink">
          {error}
        </p>
      )}
    </FormDialog>
  );
}

function ResetTotpDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const qc = useQueryClient();
  const reset = useMutation({
    mutationFn: () =>
      call(api.POST("/admin/users/{id}/totp/reset", { params: { path: { id: user.id } } })),
    onSuccess: () => {
      toast(t.admin.totpReset(user.email));
      void qc.invalidateQueries({ queryKey: adminKeys.users });
      // The admin may have reset their own TOTP.
      void qc.invalidateQueries({ queryKey: keys.session });
    },
    onError: failure,
    onSettled: onClose,
  });
  return (
    <ConfirmDialog
      open
      title={t.admin.resetTotpTitle(user.email)}
      body={t.admin.resetTotpBody}
      confirmLabel={t.admin.resetTotp}
      busy={reset.isPending}
      onConfirm={() => reset.mutate()}
      onCancel={onClose}
    />
  );
}

/** Removal is confirmed by typing the user's address (it cannot be undone). */
function RemoveUserDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const qc = useQueryClient();
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    mutationFn: () => call(api.DELETE("/admin/users/{id}", { params: { path: { id: user.id } } })),
    onSuccess: () => {
      toast(t.admin.removed(user.email));
      void qc.invalidateQueries({ queryKey: adminKeys.all });
    },
    onError: failure,
    onSettled: onClose,
  });
  const matches = typed.trim().toLowerCase() === user.email.toLowerCase();
  return (
    <FormDialog
      title={t.admin.removeTitle(user.email)}
      description={t.admin.removeBody}
      submitLabel={t.admin.remove}
      busy={remove.isPending}
      disabled={!matches}
      onSubmit={() => matches && remove.mutate()}
      onClose={onClose}
    >
      <label className="flex flex-col gap-1">
        <span>{t.admin.removeConfirm(user.email)}</span>
        <input
          type="text"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className={input}
        />
      </label>
    </FormDialog>
  );
}
