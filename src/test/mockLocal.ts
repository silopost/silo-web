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
    calls: {
      login: [] as { email: string; password: string; totpCode?: string }[],
    },
  };

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
  ];

  return { state, handlers };
}
