import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../api/client";
import { call, isApiError } from "../../api/errors";
import { keys } from "../../api/keys";
import { metaQuery } from "../../api/queries/meta";
import type { ConnectionParams, Discovery, TestResult } from "../../api/types";
import { t } from "../../lib/i18n";
import { toast } from "../../state/toasts";
import { providerOf, startOAuth, type OAuthProvider } from "../account/oauth";

type Tls = "implicit" | "starttls" | "none";
type Server = { host: string; port: string; tls: Tls };
type Fields = { username: string; imap: Server; smtp: Server };

const TLS_MODES: Tls[] = ["implicit", "starttls", "none"];
const PROVIDERS: OAuthProvider[] = ["google", "microsoft"];

const emptyFields = (email: string): Fields => ({
  username: email,
  imap: { host: "", port: "993", tls: "implicit" },
  smtp: { host: "", port: "587", tls: "starttls" },
});

/** The discovered settings as editable fields; what was not found stays empty. */
function fieldsOf(d: Discovery, email: string): Fields {
  const p = d.params;
  const base = emptyFields(email);
  return {
    username: p.username || d.username || email,
    imap: {
      host: p.imapHost ?? "",
      port: p.imapPort ? String(p.imapPort) : base.imap.port,
      tls: p.imapTls ?? base.imap.tls,
    },
    smtp: {
      host: p.smtpHost ?? "",
      port: p.smtpPort ? String(p.smtpPort) : base.smtp.port,
      tls: p.smtpTls ?? base.smtp.tls,
    },
  };
}

/** Text of an error answer of discover, test or add (plan 5.3 codes). */
function errorText(err: unknown): string {
  if (isApiError(err, 429)) return t.rateLimitedToast(err.retryAfter);
  if (isApiError(err) && err.code && t.addAccount.errors[err.code])
    return t.addAccount.errors[err.code]!;
  return t.genericError;
}

const input = "rounded border border-line px-2 py-1 read-only:bg-hover read-only:text-ink-muted";
const button = "rounded-full px-4 py-2 font-medium text-primary hover:bg-hover disabled:opacity-60";
const primary = "rounded-full bg-primary px-4 py-2 font-medium text-white disabled:opacity-60";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

/** ✓/✗ per stage of POST /accounts/test (also the `test` of 422 account_test_failed). */
function TestSteps({ result }: { result: TestResult }) {
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <p role="status" className={result.imap.ok && result.smtp.ok ? "" : "text-error-ink"}>
        {result.imap.ok && result.smtp.ok ? t.addAccount.testOk : t.addAccount.testFailed}
      </p>
      {(["imap", "smtp"] as const).map((proto) => (
        <section key={proto} aria-label={t.addAccount.protocols[proto]}>
          <h4 className="text-sm font-medium">{t.addAccount.protocols[proto]}</h4>
          <ul className="text-sm">
            {(result[proto].steps ?? []).map((s, i) => {
              const name = t.addAccount.steps[s.step] ?? s.step;
              const state = s.ok ? t.addAccount.stepOk : t.addAccount.stepFailed;
              return (
                <li
                  key={`${s.step}-${i}`}
                  aria-label={[name, state, s.detail].filter(Boolean).join(", ")}
                  className="flex gap-2"
                >
                  <span aria-hidden="true" className={s.ok ? "text-primary" : "text-error-ink"}>
                    {s.ok ? "✓" : "✗"}
                  </span>
                  <span className="font-medium">{name}</span>
                  {s.detail && (
                    <span className="min-w-0 break-words text-ink-muted">{s.detail}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ServerFields({
  title,
  value,
  fixed,
  onChange,
}: {
  title: string;
  value: Server;
  fixed: boolean;
  onChange: (s: Server) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2 rounded border border-line p-3">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      <Field label={t.addAccount.host}>
        <input
          aria-label={`${title}: ${t.addAccount.host}`}
          value={value.host}
          readOnly={fixed}
          onChange={(e) => onChange({ ...value, host: e.target.value.trim() })}
          className={input}
        />
      </Field>
      <div className="flex gap-2">
        <Field label={t.addAccount.port}>
          <input
            aria-label={`${title}: ${t.addAccount.port}`}
            inputMode="numeric"
            value={value.port}
            readOnly={fixed}
            onChange={(e) => onChange({ ...value, port: e.target.value.replace(/\D/g, "") })}
            className={`${input} w-24`}
          />
        </Field>
        <Field label={t.addAccount.tls}>
          <select
            aria-label={`${title}: ${t.addAccount.tls}`}
            value={value.tls}
            disabled={fixed}
            onChange={(e) => onChange({ ...value, tls: e.target.value as Tls })}
            className={input}
          >
            {TLS_MODES.map((m) => (
              <option key={m} value={m}>
                {t.addAccount.tlsModes[m]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {value.tls === "none" && <p className="text-sm text-warn-ink">{t.addAccount.tlsNone}</p>}
    </fieldset>
  );
}

/**
 * "Dodaj konto" (plan 6.3): address and password → POST /accounts/discover fills the server
 * settings (editable under "Zaawansowane"; read-only hosts when the instance allows only its
 * own server) → "Test connection" (POST /accounts/test, steps with ✓/✗) → "Add"
 * (POST /accounts, which tests again). OAuth providers of the instance get their own buttons.
 */
export function AddAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const returnTo = useLocation().pathname;
  const meta = useQuery(metaQuery).data;
  const providers = PROVIDERS.filter((p) => meta?.oauthProviders?.includes(p));
  const fixedHosts = meta?.allowCustomServers === false;
  const advancedId = useId();

  const [step, setStep] = useState<"email" | "settings">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [fields, setFields] = useState<Fields>(() => emptyFields(""));
  const [advanced, setAdvanced] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep("email");
    setPassword("");
    setDiscovery(null);
    setResult(null);
    setError(null);
  };

  const discover = useMutation({
    mutationFn: () => call(api.POST("/accounts/discover", { body: { email: email.trim() } })),
    onMutate: () => setError(null),
    onSuccess: (d) => {
      setDiscovery(d);
      setFields(fieldsOf(d, email.trim()));
      // Nothing found: the server settings have to be typed in.
      setAdvanced(!d.imap);
      setResult(null);
      setStep("settings");
    },
    onError: (err) => {
      if (isApiError(err, 400) || isApiError(err, 422))
        setError(t.addAccount.errors.invalid_email!);
      else if (isApiError(err, 429)) setError(errorText(err));
      else {
        // Discovery failed: continue by hand.
        setDiscovery(null);
        setFields(emptyFields(email.trim()));
        setAdvanced(true);
        setStep("settings");
      }
    },
  });

  /** ConnectionParams of the form; with fixed hosts the server uses its default server. */
  const params = (): ConnectionParams => {
    const base = { email: email.trim(), password, username: fields.username.trim() || undefined };
    if (fixedHosts) return base;
    const { imap, smtp } = fields;
    return {
      ...base,
      ...(imap.host ? { imapHost: imap.host } : {}),
      ...(imap.port ? { imapPort: Number(imap.port) } : {}),
      imapTls: imap.tls,
      ...(smtp.host ? { smtpHost: smtp.host } : {}),
      ...(smtp.port ? { smtpPort: Number(smtp.port) } : {}),
      smtpTls: smtp.tls,
    };
  };

  const test = useMutation({
    mutationFn: () => call(api.POST("/accounts/test", { body: params() })),
    onMutate: () => {
      setError(null);
      setResult(null);
    },
    onSuccess: setResult,
    onError: (err) => setError(errorText(err)),
  });

  const add = useMutation({
    mutationFn: () =>
      call(
        api.POST("/accounts", {
          body: { ...params(), ...(displayName.trim() ? { displayName: displayName.trim() } : {}) },
        }),
      ),
    onMutate: () => setError(null),
    onSuccess: async (account) => {
      toast(t.addAccount.added(account.email));
      await qc.refetchQueries({ queryKey: keys.session });
      reset();
      setEmail("");
      onClose();
      await navigate({
        to: "/u/$account/$label",
        params: { account: String(account.position), label: "inbox" },
      });
    },
    onError: (err) => {
      if (isApiError(err) && err.problem?.test) setResult(err.problem.test);
      setError(errorText(err));
    },
  });

  const oauth = useMutation({
    mutationFn: (provider: OAuthProvider) => startOAuth(provider, { returnTo }),
    onError: () => setError(t.genericError),
  });

  const busy = discover.isPending || test.isPending || add.isPending || oauth.isPending;
  const hinted = providerOf(discovery?.provider);

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim() && password) discover.mutate();
  };
  const submitSettings = (e: FormEvent) => {
    e.preventDefault();
    add.mutate();
  };

  const oauthButtons = providers.length > 0 && (
    <div className="flex flex-col gap-2">
      {providers.map((p) => (
        <button
          key={p}
          type="button"
          disabled={busy}
          onClick={() => oauth.mutate(p)}
          className="rounded-full border border-line px-4 py-2 font-medium hover:bg-hover disabled:opacity-60"
        >
          {t.addAccount.oauth[p]}
        </button>
      ))}
    </div>
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[92vh] w-[min(36rem,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-panel p-6 shadow-xl">
          <Dialog.Title className="mb-1 text-lg">{t.addAccount.title}</Dialog.Title>
          <Dialog.Description className="mb-4 text-sm text-ink-muted">
            {t.addAccount.appPasswordHint}
          </Dialog.Description>

          {step === "email" ? (
            <form onSubmit={submitEmail} className="flex flex-col gap-4">
              {oauthButtons}
              {providers.length > 0 && (
                <p className="text-center text-sm text-ink-muted">{t.addAccount.or}</p>
              )}
              <Field label={t.addAccount.email}>
                <input
                  type="email"
                  autoFocus
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={input}
                />
              </Field>
              <Field label={t.addAccount.password}>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={input}
                />
              </Field>
              {error && (
                <p role="alert" className="text-sm text-error-ink">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Dialog.Close className={button}>{t.cancel}</Dialog.Close>
                <button
                  type="submit"
                  disabled={busy || !email.trim() || !password}
                  className={primary}
                >
                  {discover.isPending ? t.addAccount.discovering : t.addAccount.next}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={submitSettings} className="flex flex-col gap-4">
              <div>
                <div className="font-medium">{email.trim()}</div>
                <p role="status" className="text-sm text-ink-muted">
                  {discovery?.source
                    ? t.addAccount.found(t.addAccount.sources[discovery.source] ?? discovery.source)
                    : t.addAccount.notFound}
                </p>
              </div>
              {hinted && providers.includes(hinted) && (
                <div className="flex flex-col gap-2 rounded bg-warn-bg p-3 text-warn-ink">
                  <p>{t.addAccount.providerHint[discovery!.provider]}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => oauth.mutate(hinted)}
                    className="self-start rounded-full bg-primary px-4 py-1.5 font-medium text-white disabled:opacity-60"
                  >
                    {t.addAccount.oauth[hinted]}
                  </button>
                </div>
              )}
              <Field label={t.addAccount.password}>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={input}
                />
              </Field>
              <Field label={t.addAccount.displayName}>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={input}
                />
              </Field>
              <div>
                <button
                  type="button"
                  aria-expanded={advanced}
                  aria-controls={advancedId}
                  onClick={() => setAdvanced((a) => !a)}
                  className="font-medium text-primary hover:underline"
                >
                  {advanced ? "▾" : "▸"} {t.addAccount.advanced}
                </button>
                {advanced && (
                  <div id={advancedId} className="mt-2 flex flex-col gap-3">
                    {fixedHosts && (
                      <p className="text-sm text-ink-muted">{t.addAccount.hostsFixed}</p>
                    )}
                    <Field label={t.addAccount.username}>
                      <input
                        value={fields.username}
                        onChange={(e) => setFields({ ...fields, username: e.target.value })}
                        className={input}
                      />
                    </Field>
                    <ServerFields
                      title={t.addAccount.imap}
                      value={fields.imap}
                      fixed={fixedHosts}
                      onChange={(imap) => setFields({ ...fields, imap })}
                    />
                    <ServerFields
                      title={t.addAccount.smtp}
                      value={fields.smtp}
                      fixed={fixedHosts}
                      onChange={(smtp) => setFields({ ...fields, smtp })}
                    />
                  </div>
                )}
              </div>
              {result && <TestSteps result={result} />}
              {error && (
                <p role="alert" className="text-sm text-error-ink">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setStep("email");
                    setResult(null);
                    setError(null);
                  }}
                  className={`${button} mr-auto`}
                >
                  {t.addAccount.back}
                </button>
                <button
                  type="button"
                  disabled={busy || !password}
                  onClick={() => test.mutate()}
                  className={`${button} border border-line`}
                >
                  {test.isPending ? t.addAccount.testing : t.addAccount.test}
                </button>
                <button type="submit" disabled={busy || !password} className={primary}>
                  {add.isPending ? t.addAccount.adding : t.addAccount.add}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
