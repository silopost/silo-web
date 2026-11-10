import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import { call, isApiError } from "../api/errors";
import { keys } from "../api/keys";
import { metaQuery } from "../api/queries/meta";
import { adoptSession } from "../api/queries/session";
import { Brand } from "../components/Brand";
import { t } from "../lib/i18n";
import { clearOfflineData } from "../pwa/offlineCache";

type LoginSearch = { redirect?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  component: LoginPage,
});

function errorText(err: unknown, local: boolean): string {
  // Mode local never tells which of address, password or code was wrong (plan 3.15).
  if (isApiError(err, 401)) return local ? t.login.invalidLocal : t.invalidCredentials;
  if (isApiError(err, 429)) return t.rateLimited(err.retryAfter);
  if (isApiError(err)) return t.genericError;
  return t.serverUnreachable;
}

const isTotpRequired = (err: unknown) => isApiError(err, 401) && err.code === "totp_required";

function ServerVersion() {
  const meta = useQuery(metaQuery);
  return (
    <p className="text-xs text-ink-muted" role="status">
      {meta.isPending && t.loading}
      {meta.isError && t.serverUnreachable}
      {meta.data && t.serverVersion(meta.data.serverVersion)}
    </p>
  );
}

const input = "rounded border border-line px-3 py-2";

/**
 * Sign-in (plan 3.15, 5.1). Mode imap: the mailbox address and password. Mode local: the Silo
 * account; a user with TOTP gets `401 totp_required` after a correct password and a second step
 * asks for the app's 6-digit code or a backup code, sent with the same address and password
 * again. The password lives only in this component's state until the sign-in ends.
 */
function LoginPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const local = useQuery(metaQuery).data?.authMode === "local";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"password" | "code">("password");
  const [backup, setBackup] = useState(false);
  const [code, setCode] = useState("");

  const login = useMutation({
    mutationFn: (totpCode?: string) =>
      call(
        api.POST("/session", {
          body: totpCode ? { email, password, totpCode } : { email, password },
        }),
      ),
    onSuccess: async (session) => {
      setPassword("");
      setCode("");
      qc.clear();
      // Another user may sign in on this browser: drop what the PWA cached before.
      await clearOfflineData();
      qc.setQueryData(keys.session, adoptSession(session));
      if (redirect?.startsWith("/u/")) await navigate({ to: redirect });
      else await navigate({ to: "/u/$account/$label", params: { account: "0", label: "inbox" } });
    },
    onError: (err) => {
      if (isTotpRequired(err)) setStep("code");
      else if (step === "code") setCode("");
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step === "code") login.mutate(code.replace(/\s+/g, ""));
    else login.mutate(undefined);
  };

  const backToPassword = () => {
    login.reset();
    setStep("password");
    setPassword("");
    setCode("");
    setBackup(false);
  };

  const toggleBackup = () => {
    login.reset();
    setCode("");
    setBackup((b) => !b);
  };

  return (
    <main className="flex min-h-full items-center justify-center bg-surface p-4">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-panel p-8 shadow"
        aria-labelledby="login-title"
      >
        <div>
          <h1 className="text-2xl">
            <Brand />
          </h1>
          <h2 id="login-title" className="mt-4 text-lg">
            {step === "code" ? t.login.codeTitle : local ? t.login.localTitle : t.loginTitle}
          </h2>
          {step === "code" ? (
            <p className="text-ink-muted">{backup ? t.login.backupHint : t.login.codeHint}</p>
          ) : (
            !local && <p className="text-ink-muted">{t.loginSubtitle}</p>
          )}
        </div>
        {step === "password" ? (
          <>
            <label className="flex flex-col gap-1">
              <span>{t.email}</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={input}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>{t.password}</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={input}
              />
            </label>
          </>
        ) : (
          <>
            <p className="text-sm">{email}</p>
            {backup ? (
              <label key="backup" className="flex flex-col gap-1">
                <span>{t.login.backupCode}</span>
                <input
                  type="text"
                  autoComplete="off"
                  autoFocus
                  required
                  maxLength={12}
                  spellCheck={false}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={`${input} font-mono`}
                />
              </label>
            ) : (
              <label key="app" className="flex flex-col gap-1">
                <span>{t.login.appCode}</span>
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
                  className={`${input} font-mono tracking-widest`}
                />
              </label>
            )}
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <button type="button" onClick={toggleBackup} className="text-primary underline">
                {backup ? t.login.useAppCode : t.login.useBackupCode}
              </button>
              <button type="button" onClick={backToPassword} className="text-primary underline">
                {t.login.back}
              </button>
            </div>
          </>
        )}
        {login.isError && !isTotpRequired(login.error) && (
          <p role="alert" className="rounded bg-error-bg px-3 py-2 text-error-ink">
            {errorText(login.error, local)}
          </p>
        )}
        <button
          type="submit"
          disabled={login.isPending}
          className="rounded-full bg-primary px-6 py-2 font-medium text-on-primary disabled:opacity-60"
        >
          {login.isPending ? t.signingIn : step === "code" ? t.login.verify : t.signIn}
        </button>
        <ServerVersion />
      </form>
    </main>
  );
}
