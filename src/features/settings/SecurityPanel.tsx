import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../api/client";
import { call, isApiError } from "../../api/errors";
import { keys } from "../../api/keys";
import { metaQuery } from "../../api/queries/meta";
import type { SessionInfo } from "../../api/types";
import { formatFullDate } from "../../lib/format";
import { t } from "../../lib/i18n";
import { toast } from "../../state/toasts";
import { useSession } from "../account";
import { BackupCodesDialog } from "../security/BackupCodesDialog";
import { copyText } from "../security/clipboard";
import { QrCode } from "../security/QrCode";

const primary =
  "self-start rounded-full bg-primary px-4 py-1.5 font-medium text-white disabled:opacity-60";
const outline =
  "rounded-full border border-line px-4 py-1.5 font-medium text-primary hover:bg-hover disabled:opacity-60";
const input = "rounded border border-line px-3 py-2";

/** The server's minimum length of a Silo password (ChangePasswordInputBody). */
const MIN_PASSWORD = 10;

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="grid grid-cols-[14rem_1fr] gap-6 border-b border-line py-4"
    >
      <div>
        <h2 id={id} className="font-medium">
          {title}
        </h2>
        {hint && <p className="text-sm text-ink-muted">{hint}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

/**
 * Settings → Security (mode local, plan 3.15): the Silo password, TOTP with backup
 * codes, and the signed-in devices. In mode imap the tab is hidden and the URL explains why.
 */
export function SecurityPanel() {
  const meta = useQuery(metaQuery).data;
  if (!meta) return <p className="text-ink-muted">{t.loading}</p>;
  if (meta.authMode !== "local") return <p role="status">{t.security.unavailable}</p>;
  return (
    <div className="max-w-4xl">
      <PasswordSection />
      <TotpSection />
      <SessionsSection />
    </div>
  );
}

function PasswordSection() {
  const qc = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const errorId = useId();

  const change = useMutation({
    mutationFn: () =>
      call(
        api.POST("/session/password", { body: { currentPassword: current, newPassword: next } }),
      ),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setRepeat("");
      setDone(true);
      toast(t.security.passwordChanged);
      void qc.invalidateQueries({ queryKey: keys.sessions });
    },
    onError: (err) => {
      if (isApiError(err, 403)) setError(t.security.wrongPassword);
      else if (isApiError(err, 422)) setError(t.security.passwordTooShort);
      else if (!isApiError(err, 429)) setError(t.genericError);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setDone(false);
    if (next.length < MIN_PASSWORD) return setError(t.security.passwordTooShort);
    if (next !== repeat) return setError(t.security.passwordMismatch);
    setError(null);
    change.mutate();
  };

  const field = (label: string, value: string, set: (v: string) => void, auto: string) => (
    <label className="flex flex-col gap-1">
      <span>{label}</span>
      <input
        type="password"
        required
        autoComplete={auto}
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-describedby={error ? errorId : undefined}
        className={`${input} max-w-sm`}
      />
    </label>
  );

  return (
    <Section title={t.security.passwordTitle} hint={t.security.passwordHint}>
      <form onSubmit={submit} className="flex flex-col gap-3" aria-label={t.security.passwordTitle}>
        {field(t.security.currentPassword, current, setCurrent, "current-password")}
        {field(t.security.newPassword, next, setNext, "new-password")}
        {field(t.security.repeatPassword, repeat, setRepeat, "new-password")}
        {error && (
          <p id={errorId} role="alert" className="text-sm text-error-ink">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="text-sm">
            {t.security.passwordChanged}
          </p>
        )}
        <button type="submit" disabled={change.isPending} className={primary}>
          {t.security.savePassword}
        </button>
      </form>
    </Section>
  );
}

function TotpSection() {
  const qc = useQueryClient();
  const enabled = useSession()?.user.totpEnabled ?? false;
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [dialog, setDialog] = useState<"disable" | "regenerate" | null>(null);
  const codeErrorId = useId();
  const refreshSession = () => qc.invalidateQueries({ queryKey: keys.session });

  const start = useMutation({
    mutationFn: () => call(api.POST("/totp/setup")),
    onSuccess: (data) => {
      setSetup(data);
      setCode("");
      setCodeError(null);
    },
    onError: (err) => {
      if (isApiError(err, 409)) void refreshSession();
      if (!isApiError(err, 429)) toast(t.genericError);
    },
  });

  const enable = useMutation({
    mutationFn: () => call(api.POST("/totp/enable", { body: { code } })),
    onSuccess: (data) => {
      setSetup(null);
      setCode("");
      setCodes(data.backupCodes ?? []);
      toast(t.security.totpEnabled);
      void refreshSession();
    },
    onError: (err) => {
      if (isApiError(err, 422)) setCodeError(t.security.totpInvalidCode);
      else if (isApiError(err, 409)) {
        setSetup(null);
        void refreshSession();
        toast(t.genericError);
      } else if (!isApiError(err, 429)) setCodeError(t.genericError);
    },
  });

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    setCodeError(null);
    enable.mutate();
  };

  return (
    <Section title={t.security.totpTitle} hint={t.security.totpHint}>
      <p className="font-medium" data-testid="totp-state">
        {enabled ? t.security.totpOn : t.security.totpOff}
      </p>
      {!enabled && !setup && (
        <button
          type="button"
          disabled={start.isPending}
          onClick={() => start.mutate()}
          className={primary}
        >
          {t.security.totpEnable}
        </button>
      )}
      {!enabled && setup && (
        <form onSubmit={submitCode} className="flex flex-col gap-3">
          <p>{t.security.totpScan}</p>
          <QrCode value={setup.otpauthUrl} label={t.security.totpQr} />
          <div>
            <div className="text-sm text-ink-muted">{t.security.totpSecret}</div>
            <div className="flex items-center gap-2">
              <code data-testid="totp-secret" className="font-mono break-all">
                {setup.secret.replace(/(.{4})/g, "$1 ").trim()}
              </code>
              <button type="button" onClick={() => void copyText(setup.secret)} className={outline}>
                {t.security.copy}
              </button>
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span>{t.security.totpCode}</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? codeErrorId : undefined}
              className={`${input} w-40 font-mono tracking-widest`}
            />
          </label>
          {codeError && (
            <p id={codeErrorId} role="alert" className="text-sm text-error-ink">
              {codeError}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={enable.isPending} className={primary}>
              {t.security.totpConfirm}
            </button>
            <button
              type="button"
              onClick={() => setSetup(null)}
              className="rounded-full px-4 py-1.5 font-medium text-primary hover:bg-hover"
            >
              {t.cancel}
            </button>
          </div>
        </form>
      )}
      {enabled && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setDialog("regenerate")} className={outline}>
            {t.security.regenerate}
          </button>
          <button type="button" onClick={() => setDialog("disable")} className={outline}>
            {t.security.totpDisable}
          </button>
        </div>
      )}
      {dialog && (
        <SecondFactorDialog
          kind={dialog}
          onClose={() => setDialog(null)}
          onDone={(backupCodes) => {
            setDialog(null);
            if (backupCodes) setCodes(backupCodes);
            else toast(t.security.totpDisabled);
            void refreshSession();
          }}
        />
      )}
      {codes && <BackupCodesDialog codes={codes} onClose={() => setCodes(null)} />}
    </Section>
  );
}

/** Password + TOTP (or backup) code for DELETE /totp and POST /totp/backup-codes. */
function SecondFactorDialog({
  kind,
  onClose,
  onDone,
}: {
  kind: "disable" | "regenerate";
  onClose: () => void;
  onDone: (backupCodes?: string[]) => void;
}) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const run = useMutation({
    mutationFn: async (): Promise<string[] | undefined> => {
      const body = { password, code: code.replace(/\s+/g, "") };
      if (kind === "disable") {
        await call(api.DELETE("/totp", { body }));
        return undefined;
      }
      return (await call(api.POST("/totp/backup-codes", { body }))).backupCodes ?? [];
    },
    onSuccess: (codes) => onDone(codes),
    onError: (err) => {
      if (isApiError(err, 403)) setError(t.security.wrongPasswordOrCode);
      else if (isApiError(err, 409)) onDone();
      else if (!isApiError(err, 429)) setError(t.genericError);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    run.mutate();
  };

  const title = kind === "disable" ? t.security.totpDisableTitle : t.security.regenerateTitle;
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(28rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-panel p-6 shadow-xl">
          <Dialog.Title className="text-lg">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-ink-muted">
            {kind === "regenerate" && `${t.security.regenerateHint} `}
            {t.security.reauthHint}
          </Dialog.Description>
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span>{t.security.password}</span>
              <input
                type="password"
                required
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={input}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>{t.security.code}</span>
              <input
                type="text"
                required
                autoComplete="one-time-code"
                maxLength={12}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                aria-describedby={error ? errorId : undefined}
                className={`${input} font-mono`}
              />
            </label>
            {error && (
              <p id={errorId} role="alert" className="text-sm text-error-ink">
                {error}
              </p>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <Dialog.Close className="rounded-full px-4 py-2 font-medium text-primary hover:bg-hover">
                {t.cancel}
              </Dialog.Close>
              <button
                type="submit"
                disabled={run.isPending}
                className="rounded-full bg-primary px-4 py-2 font-medium text-white disabled:opacity-60"
              >
                {kind === "disable" ? t.security.totpDisable : t.security.confirm}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function browserOf(ua: string): string | null {
  if (/Edg\//.test(ua)) return "Edge";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return null;
}

function systemOf(ua: string): string | null {
  if (/Windows/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad/.test(ua)) return "iOS";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

/** A short device name: the native client's name, else browser and system from User-Agent. */
function deviceName(s: SessionInfo): string {
  if (s.clientName) return s.clientName;
  const browser =
    browserOf(s.userAgent) ?? (s.kind === "bearer" ? t.security.nativeApp : t.security.browser);
  const system = systemOf(s.userAgent);
  return system ? `${browser} · ${system}` : browser;
}

function SessionsSection() {
  const qc = useQueryClient();
  const sessions = useQuery({
    queryKey: keys.sessions,
    queryFn: ({ signal }) => call(api.GET("/sessions", { signal })),
    select: (d) => d.sessions ?? [],
  });
  const revokeOne = useMutation({
    mutationFn: (id: string) => call(api.DELETE("/sessions/{id}", { params: { path: { id } } })),
    onSuccess: () => toast(t.security.revoked),
    onError: () => toast(t.genericError),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.sessions }),
  });
  const revokeOthers = useMutation({
    // One request revokes every session of the user except the current one.
    mutationFn: async (count: number) => {
      await call(api.DELETE("/sessions", { params: { query: { others: true } } }));
      return count;
    },
    onSuccess: (n) => toast(n === 1 ? t.security.revoked : t.security.revokedOthers(n)),
    onError: () => toast(t.genericError),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.sessions }),
  });
  const pending = revokeOne.isPending || revokeOthers.isPending;
  const list = sessions.data ?? [];
  const others = list.filter((s) => !s.current).map((s) => s.id);

  return (
    <Section title={t.security.sessionsTitle} hint={t.security.sessionsHint}>
      {sessions.isPending && <p className="text-ink-muted">{t.loading}</p>}
      {sessions.isError && <p role="alert">{t.genericError}</p>}
      {list.length > 0 && (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t.security.sessionsTitle}</caption>
          <thead className="text-ink-muted">
            <tr>
              <th scope="col" className="py-1 pr-4 font-medium">
                {t.security.device}
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                {t.security.ip}
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                {t.security.lastSeen}
              </th>
              <th scope="col" className="py-1 font-medium">
                <span className="sr-only">{t.security.revoke}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((s) => (
              <tr key={s.id}>
                <td className="py-2 pr-4" title={s.userAgent}>
                  {deviceName(s)}
                  {s.current && (
                    <span className="ml-2 rounded bg-hover px-1.5 text-xs">
                      {t.security.current}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4">{s.ip ?? "–"}</td>
                <td className="py-2 pr-4">{formatFullDate(s.lastSeenAt)}</td>
                <td className="py-2 text-right">
                  {!s.current && (
                    <button
                      type="button"
                      disabled={pending}
                      aria-label={t.security.revokeOf(deviceName(s))}
                      onClick={() => revokeOne.mutate(s.id)}
                      className="font-medium text-primary hover:underline disabled:opacity-60"
                    >
                      {t.security.revoke}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {sessions.isSuccess &&
        (others.length > 0 ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => revokeOthers.mutate(others.length)}
            className={`${outline} self-start`}
          >
            {t.security.revokeOthers}
          </button>
        ) : (
          <p className="text-sm text-ink-muted">{t.security.noOtherSessions}</p>
        ))}
    </Section>
  );
}
