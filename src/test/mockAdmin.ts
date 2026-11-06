import { http, HttpResponse } from "msw";
import type { AdminAccount, AdminJob, AdminUser } from "../api/types";
import type { createMockMail } from "./mockMail";

type MockMail = ReturnType<typeof createMockMail>;

const problem = (status: number, code: string) =>
  HttpResponse.json({ status, code, title: code }, { status });

/**
 * /admin/* of silo-server (plan 5.1) for msw: users, accounts and jobs. The signed-in user of
 * createMockMail (u_1) is an admin unless `forbidden` is set (every call answers 403).
 */
export function createAdminMock(mail: MockMail) {
  mail.session.user.isAdmin = true;
  const state = {
    forbidden: false,
    users: [
      {
        id: "u_1",
        email: "dev1@silo.test",
        displayName: "Dev One",
        isAdmin: true,
        disabled: false,
        totpEnabled: false,
        createdAt: "2026-11-01T08:00:00Z",
        accounts: [
          {
            id: "acc_1",
            email: "dev1@silo.test",
            state: "live",
            lastSyncAt: "2026-11-05T09:00:00Z",
            error: null,
          },
        ],
      },
      {
        id: "u_2",
        email: "ala@silo.test",
        displayName: "Ala",
        isAdmin: false,
        disabled: false,
        totpEnabled: true,
        createdAt: "2026-11-02T08:00:00Z",
        accounts: [
          {
            id: "acc_2",
            email: "ala@example.com",
            state: "auth_failed",
            lastSyncAt: null,
            error: "AUTHENTICATIONFAILED",
          },
        ],
      },
    ] as AdminUser[],
    accounts: [
      {
        id: "acc_1",
        userId: "u_1",
        userEmail: "dev1@silo.test",
        email: "dev1@silo.test",
        displayName: "Dev One",
        imapHost: "mail.silo.test",
        state: "live",
        lastSyncAt: "2026-11-05T09:00:00Z",
        error: null,
        pendingOps: 0,
        deadOps: 0,
        createdAt: "2026-11-01T08:00:00Z",
      },
      {
        id: "acc_2",
        userId: "u_2",
        userEmail: "ala@silo.test",
        email: "ala@example.com",
        displayName: "",
        imapHost: "imap.example.com",
        state: "auth_failed",
        lastSyncAt: null,
        error: "AUTHENTICATIONFAILED",
        pendingOps: 3,
        deadOps: 2,
        createdAt: "2026-11-02T08:00:00Z",
      },
    ] as AdminAccount[],
    jobs: [
      {
        id: "job_1",
        kind: "imap_op",
        status: "dead",
        accountId: "acc_2",
        userId: "u_2",
        attempts: 8,
        maxAttempts: 8,
        lastError: `NO [TRYCREATE] Mailbox does not exist: ${"x".repeat(120)}`,
        runAt: "2026-11-05T09:30:00Z",
        createdAt: "2026-11-05T09:00:00Z",
      },
      {
        id: "job_2",
        kind: "imap_op",
        status: "dead",
        accountId: "acc_2",
        userId: "u_2",
        attempts: 8,
        maxAttempts: 8,
        lastError: "connection reset",
        runAt: "2026-11-05T09:40:00Z",
        createdAt: "2026-11-05T09:10:00Z",
      },
      {
        id: "job_3",
        kind: "send",
        status: "pending",
        accountId: null,
        userId: null,
        attempts: 0,
        maxAttempts: 5,
        lastError: null,
        runAt: "2026-11-05T10:00:00Z",
        createdAt: "2026-11-05T09:59:00Z",
      },
    ] as AdminJob[],
    nextTemporaryPassword: "Tymczasowe-1234",
    calls: {
      jobsQuery: [] as string[],
      create: [] as Record<string, unknown>[],
      patch: [] as (Record<string, unknown> & { id: string })[],
      totpReset: [] as string[],
      deleteUser: [] as string[],
      retry: [] as string[],
      deleteJob: [] as string[],
    },
  };

  const guard = () => (state.forbidden ? problem(403, "forbidden") : null);
  const self = mail.session.user.id;

  const handlers = [
    http.get("*/api/v1/admin/users", () => guard() ?? HttpResponse.json({ users: state.users })),
    http.post("*/api/v1/admin/users", async ({ request }) => {
      const denied = guard();
      if (denied) return denied;
      if (mail.state.authMode !== "local") return problem(409, "not_available");
      const body = (await request.json()) as {
        email: string;
        displayName?: string;
        isAdmin?: boolean;
        password?: string;
      };
      state.calls.create.push(body);
      if (state.users.some((u) => u.email === body.email)) return problem(409, "user_exists");
      const user: AdminUser = {
        id: `u_${state.users.length + 1}`,
        email: body.email,
        displayName: body.displayName ?? "",
        isAdmin: body.isAdmin ?? false,
        disabled: false,
        totpEnabled: false,
        createdAt: "2026-11-05T10:00:00Z",
        accounts: [],
      };
      state.users.push(user);
      return HttpResponse.json(
        body.password ? user : { ...user, temporaryPassword: state.nextTemporaryPassword },
        { status: 201 },
      );
    }),
    http.patch("*/api/v1/admin/users/:id", async ({ params, request }) => {
      const denied = guard();
      if (denied) return denied;
      const body = (await request.json()) as Partial<AdminUser> & { password?: string };
      const id = String(params.id);
      state.calls.patch.push({ id, ...body });
      if (id === self && (body.disabled !== undefined || body.isAdmin === false))
        return problem(409, "admin_self_change");
      const user = state.users.find((u) => u.id === id);
      if (!user) return problem(404, "not_found");
      if (body.disabled !== undefined) user.disabled = body.disabled;
      if (body.isAdmin !== undefined) user.isAdmin = body.isAdmin;
      return HttpResponse.json(user);
    }),
    http.post("*/api/v1/admin/users/:id/totp/reset", ({ params }) => {
      const denied = guard();
      if (denied) return denied;
      state.calls.totpReset.push(String(params.id));
      const user = state.users.find((u) => u.id === params.id);
      if (user) user.totpEnabled = false;
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete("*/api/v1/admin/users/:id", ({ params }) => {
      const denied = guard();
      if (denied) return denied;
      state.calls.deleteUser.push(String(params.id));
      if (params.id === self) return problem(409, "admin_self_change");
      state.users = state.users.filter((u) => u.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(
      "*/api/v1/admin/accounts",
      () => guard() ?? HttpResponse.json({ accounts: state.accounts }),
    ),
    http.get("*/api/v1/admin/jobs", ({ request }) => {
      const denied = guard();
      if (denied) return denied;
      const url = new URL(request.url);
      state.calls.jobsQuery.push(url.search);
      const status = url.searchParams.get("status");
      const accountId = url.searchParams.get("accountId");
      return HttpResponse.json({
        jobs: state.jobs.filter(
          (j) => (!status || j.status === status) && (!accountId || j.accountId === accountId),
        ),
      });
    }),
    http.post("*/api/v1/admin/jobs/:id/retry", ({ params }) => {
      const denied = guard();
      if (denied) return denied;
      state.calls.retry.push(String(params.id));
      const job = state.jobs.find((j) => j.id === params.id);
      if (!job) return problem(404, "not_found");
      job.status = "pending";
      job.attempts = 0;
      return HttpResponse.json(job);
    }),
    http.delete("*/api/v1/admin/jobs/:id", ({ params }) => {
      const denied = guard();
      if (denied) return denied;
      state.calls.deleteJob.push(String(params.id));
      state.jobs = state.jobs.filter((j) => j.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  ];

  return { state, handlers };
}
