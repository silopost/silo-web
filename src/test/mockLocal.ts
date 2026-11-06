import { http, HttpResponse } from "msw";
import type { createMockMail } from "./mockMail";

type MockMail = ReturnType<typeof createMockMail>;

const problem = (status: number, code: string) =>
  HttpResponse.json({ status, code, title: code }, { status });

/**
 * Mode local of silo-server on top of createMockMail (plan 3.15): Silo passwords and TOTP.
 * The valid TOTP code is always `state.totpCode`; backup codes work once.
 */
export function createLocalMock(mail: MockMail) {
  mail.state.authMode = "local";
  const user = mail.session.user;
  const state = {
    password: "devpass1",
    totpCode: "123456",
    backupCodes: ["abcde12345", "fghij67890"],
    /** Secret of POST /totp/setup, until /totp/enable confirms it. */
    pendingSecret: null as string | null,
    newBackupCodes: ["k1k1k1k1k1", "k2k2k2k2k2", "k3k3k3k3k3"],
    sessions: [
      {
        id: "s_1",
        current: true,
        kind: "cookie" as const,
        clientName: "",
        userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36",
        ip: "10.0.0.1",
        createdAt: "2026-11-05T08:00:00Z",
        lastSeenAt: "2026-11-05T09:00:00Z",
        expiresAt: "2026-12-05T08:00:00Z",
      },
      {
        id: "s_2",
        current: false,
        kind: "cookie" as const,
        clientName: "",
        userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
        ip: "10.0.0.2",
        createdAt: "2026-11-04T08:00:00Z",
        lastSeenAt: "2026-11-04T09:00:00Z",
        expiresAt: "2026-12-04T08:00:00Z",
      },
      {
        id: "s_3",
        current: false,
        kind: "bearer" as const,
        clientName: "Pixel 8",
        userAgent: "silo-mobile/0.1",
        ip: null,
        createdAt: "2026-11-03T08:00:00Z",
        lastSeenAt: "2026-11-03T09:00:00Z",
        expiresAt: "2026-12-03T08:00:00Z",
      },
    ],
    calls: {
      login: [] as { email: string; password: string; totpCode?: string }[],
      changePassword: [] as { currentPassword: string; newPassword: string }[],
      totpEnable: [] as string[],
      totpDisable: [] as { password: string; code: string }[],
      backupCodes: [] as { password: string; code: string }[],
      revoke: [] as string[],
      revokeOthers: 0,
    },
  };

  /** Re-authentication of a signed-in user: a wrong password or code is 403 (plan 3.15). */
  const secondFactor = (b: { password: string; code: string }) =>
    b.password === state.password &&
    (b.code === state.totpCode || state.backupCodes.includes(b.code));

  const handlers = [
    http.post("*/api/v1/session", async ({ request }) => {
      const body = (await request.json()) as { email: string; password: string; totpCode?: string };
      state.calls.login.push(body);
      if (body.email !== user.email || body.password !== state.password)
        return problem(401, "invalid_credentials");
      if (user.totpEnabled) {
        if (!body.totpCode) return problem(401, "totp_required");
        const backup = state.backupCodes.indexOf(body.totpCode);
        if (body.totpCode !== state.totpCode && backup < 0)
          return problem(401, "invalid_credentials");
        if (backup >= 0) state.backupCodes.splice(backup, 1);
      }
      mail.state.loggedIn = true;
      return HttpResponse.json(mail.session);
    }),
    http.post("*/api/v1/session/password", async ({ request }) => {
      const body = (await request.json()) as { currentPassword: string; newPassword: string };
      state.calls.changePassword.push(body);
      if (body.currentPassword !== state.password) return problem(403, "invalid_credentials");
      if (body.newPassword.length < 10) return problem(422, "validation_failed");
      state.password = body.newPassword;
      state.sessions = state.sessions.filter((s) => s.current);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post("*/api/v1/totp/setup", () => {
      if (user.totpEnabled) return problem(409, "totp_enabled");
      state.pendingSecret = "JBSWY3DPEHPK3PXP";
      return HttpResponse.json({
        secret: state.pendingSecret,
        otpauthUrl: `otpauth://totp/Silo:${user.email}?secret=${state.pendingSecret}&issuer=Silo`,
      });
    }),
    http.post("*/api/v1/totp/enable", async ({ request }) => {
      const { code } = (await request.json()) as { code: string };
      state.calls.totpEnable.push(code);
      if (!state.pendingSecret) return problem(409, "totp_not_set_up");
      if (code !== state.totpCode) return problem(422, "invalid_totp_code");
      user.totpEnabled = true;
      state.pendingSecret = null;
      state.backupCodes = [...state.newBackupCodes];
      return HttpResponse.json({ backupCodes: state.backupCodes });
    }),
    http.delete("*/api/v1/totp", async ({ request }) => {
      const body = (await request.json()) as { password: string; code: string };
      state.calls.totpDisable.push(body);
      if (!user.totpEnabled) return problem(409, "totp_not_enabled");
      if (!secondFactor(body)) return problem(403, "invalid_credentials");
      user.totpEnabled = false;
      return new HttpResponse(null, { status: 204 });
    }),
    http.post("*/api/v1/totp/backup-codes", async ({ request }) => {
      const body = (await request.json()) as { password: string; code: string };
      state.calls.backupCodes.push(body);
      if (!secondFactor(body)) return problem(403, "invalid_credentials");
      state.backupCodes = ["n1n1n1n1n1", "n2n2n2n2n2"];
      return HttpResponse.json({ backupCodes: state.backupCodes });
    }),
    http.get("*/api/v1/sessions", () => HttpResponse.json({ sessions: state.sessions })),
    http.delete("*/api/v1/sessions", ({ request }) => {
      if (new URL(request.url).searchParams.get("others") !== "true")
        return problem(400, "invalid_request");
      state.calls.revokeOthers += 1;
      state.sessions = state.sessions.filter((s) => s.current);
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete("*/api/v1/sessions/:id", ({ params }) => {
      state.calls.revoke.push(String(params.id));
      state.sessions = state.sessions.filter((s) => s.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  ];

  return { state, handlers };
}
