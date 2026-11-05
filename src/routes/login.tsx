import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import { call, isApiError } from "../api/errors";
import { keys } from "../api/keys";
import { metaQuery } from "../api/queries/meta";
import { adoptSession } from "../api/queries/session";
import { t } from "../lib/i18n";

type LoginSearch = { redirect?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  component: LoginPage,
});

function errorText(err: unknown): string {
  if (isApiError(err, 401)) return t.invalidCredentials;
  if (isApiError(err, 429)) return t.rateLimited(err.retryAfter);
  if (isApiError(err)) return t.genericError;
  return t.serverUnreachable;
}

function ServerVersion() {
  const meta = useQuery(metaQuery);
  return (
    <p className="text-xs text-ink-muted" role="status">
      {meta.isPending && t.loading}
      {meta.isError && t.serverUnreachable}
      {meta.data && `Silo · serwer ${meta.data.serverVersion}`}
    </p>
  );
}

function LoginPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: () => call(api.POST("/session", { body: { email, password } })),
    onSuccess: async (session) => {
      qc.clear();
      qc.setQueryData(keys.session, adoptSession(session));
      if (redirect?.startsWith("/u/")) await navigate({ to: redirect });
      else await navigate({ to: "/u/$account/$label", params: { account: "0", label: "inbox" } });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };

  return (
    <main className="flex min-h-full items-center justify-center bg-surface p-4">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-panel p-8 shadow"
        aria-labelledby="login-title"
      >
        <div>
          <h1 className="text-2xl font-normal">{t.appName}</h1>
          <h2 id="login-title" className="mt-4 text-lg">
            {t.loginTitle}
          </h2>
          <p className="text-ink-muted">{t.loginSubtitle}</p>
        </div>
        <label className="flex flex-col gap-1">
          <span>{t.email}</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-line px-3 py-2"
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
            className="rounded border border-line px-3 py-2"
          />
        </label>
        {login.isError && (
          <p role="alert" className="rounded bg-error-bg px-3 py-2 text-error-ink">
            {errorText(login.error)}
          </p>
        )}
        <button
          type="submit"
          disabled={login.isPending}
          className="rounded-full bg-primary px-6 py-2 font-medium text-white disabled:opacity-60"
        >
          {login.isPending ? t.signingIn : t.signIn}
        </button>
        <ServerVersion />
      </form>
    </main>
  );
}
