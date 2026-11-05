import { http, HttpResponse } from "msw";
import type { Label, Session, Thread, ThreadDetail } from "../api/types";

/** A small stateful silo-server for msw: threads with labels, modify, undo. */
export function createMockMail() {
  const session: Session = {
    csrfToken: "csrf-1",
    user: { id: "u_1", email: "dev1@silo.test", displayName: "Dev One", isAdmin: false },
    settings: {
      activeAccountId: "acc_1",
      conversationView: true,
      density: "default",
      keyboardShortcutsEnabled: true,
      signature: "",
      timezone: "Europe/Warsaw",
      undoSendSeconds: 5,
    },
    accounts: [
      {
        id: "acc_1",
        email: "dev1@silo.test",
        displayName: "Dev One",
        error: null,
        imapHost: "mail.silo.test",
        imapPort: 993,
        imapTls: "implicit",
        smtpHost: "mail.silo.test",
        smtpPort: 587,
        smtpTls: "starttls",
        lastSyncAt: "2026-11-05T09:00:00Z",
        provider: "generic",
        sentAppend: true,
        state: "live",
        username: "dev1@silo.test",
      },
    ],
  };

  const thread = (n: number, extra: Partial<Thread> = {}): Thread => ({
    id: `t_${n}`,
    accountId: "acc_1",
    subject: `Temat ${n}`,
    snippet: `Fragment ${n}`,
    lastMessageAt: new Date(Date.UTC(2026, 10, 5, 9, 60 - n)).toISOString(),
    messageCount: 1,
    unreadCount: 0,
    hasAttachments: false,
    labelIds: ["INBOX"],
    participants: [{ email: `osoba${n}@firma.pl`, name: `Osoba ${n}`, unread: false }],
    snoozedUntil: null,
    pendingSync: false,
    ...extra,
  });

  const state = {
    loggedIn: true,
    pageSize: 3,
    threads: [
      thread(1, { labelIds: ["INBOX", "UNREAD"], unreadCount: 1 }),
      thread(2, { labelIds: ["INBOX", "STARRED"] }),
      thread(3),
      thread(4),
      thread(5),
    ],
    failModify: false,
    html: "<p>Treść wiadomości</p>",
    calls: {
      modify: [] as { ids: string[]; addLabelIds?: string[]; removeLabelIds?: string[] }[],
      undo: [] as string[],
      threadPages: [] as (string | null)[],
      login: [] as { email: string; password: string }[],
    },
  };
  const ops = new Map<string, Map<string, string[]>>();
  let opSeq = 0;

  const labels = (): Label[] =>
    ["INBOX", "STARRED", "SENT", "DRAFT", "SPAM", "TRASH"].map((id, i) => {
      const inLabel = state.threads.filter((t) => t.labelIds?.includes(id));
      return {
        id,
        accountId: "acc_1",
        name: id,
        type: "system",
        colorBg: null,
        colorText: null,
        folderId: null,
        keywordState: null,
        parentId: null,
        position: i,
        showInList: "show",
        threadsTotal: inLabel.length,
        threadsUnread: inLabel.filter((t) => t.unreadCount > 0).length,
      } satisfies Label;
    });

  const detail = (t: Thread): ThreadDetail => ({
    id: t.id,
    accountId: t.accountId,
    subject: t.subject,
    labelIds: t.labelIds,
    messages: [1, 2].map((m) => ({
      id: `m_${t.id}_${m}`,
      from: { email: `osoba@firma.pl`, name: `Nadawca ${m}` },
      to: [{ email: "dev1@silo.test", name: "" }],
      cc: [],
      bcc: [],
      replyTo: { email: "", name: "" },
      date: t.lastMessageAt,
      subject: t.subject,
      snippet: `Fragment wiadomości ${m}`,
      labelIds: m === 2 && t.unreadCount > 0 ? ["INBOX", "UNREAD"] : ["INBOX"],
      folder: { id: "f_1", name: "INBOX", role: "inbox" },
      bodyState: "full",
      hasHtml: true,
      bodyText: "",
      attachments:
        m === 2
          ? [
              {
                id: "a_1",
                filename: "oferta.pdf",
                contentType: "application/pdf",
                size: 284113,
                inline: false,
                downloaded: true,
              },
            ]
          : [],
      listUnsubscribe: null,
      pendingSync: false,
    })),
  });

  const apply = (ids: string[], add: string[], remove: string[]) => {
    const before = new Map<string, string[]>();
    for (const t of state.threads) {
      if (!ids.includes(t.id)) continue;
      before.set(t.id, t.labelIds ?? []);
      let next = (t.labelIds ?? []).filter((l) => !remove.includes(l));
      for (const l of add) if (!next.includes(l)) next.push(l);
      if (add.includes("TRASH")) next = next.filter((l) => l !== "INBOX");
      t.labelIds = next;
      t.unreadCount = next.includes("UNREAD") ? 1 : 0;
      t.pendingSync = true;
    }
    const id = `op_${++opSeq}`;
    ops.set(id, before);
    return {
      operationId: id,
      undoUntil: new Date(Date.now() + 10_000).toISOString(),
      threads: state.threads.filter((t) => ids.includes(t.id)),
    };
  };

  const unauthorized = () =>
    HttpResponse.json(
      { status: 401, code: "unauthorized", title: "Unauthorized" },
      { status: 401 },
    );

  const handlers = [
    http.get("*/api/v1/meta", () =>
      HttpResponse.json({
        serverVersion: "0.3.0",
        apiVersion: "1",
        minWebVersion: "0.3.0",
        authMode: "imap",
        allowCustomServers: false,
      }),
    ),
    http.get("*/api/v1/session", () =>
      state.loggedIn ? HttpResponse.json(session) : unauthorized(),
    ),
    http.post("*/api/v1/session", async ({ request }) => {
      const body = (await request.json()) as { email: string; password: string };
      state.calls.login.push(body);
      if (body.password !== "devpass1") {
        return HttpResponse.json(
          { status: 401, code: "invalid_credentials", title: "Unauthorized" },
          { status: 401 },
        );
      }
      state.loggedIn = true;
      return HttpResponse.json(session);
    }),
    http.delete("*/api/v1/session", () => {
      state.loggedIn = false;
      return new HttpResponse(null, { status: 204 });
    }),
    http.get("*/api/v1/labels", () => HttpResponse.json({ labels: labels() })),
    http.get("*/api/v1/accounts/:id/sync-status", () =>
      HttpResponse.json({
        id: "acc_1",
        email: "dev1@silo.test",
        state: "live",
        lastSyncAt: "2026-11-05T09:00:00Z",
        error: null,
        initialSync: {
          phase: "done",
          messagesDone: 5,
          messagesTotal: 5,
          bytesDone: 0,
          bytesTotal: 0,
          foldersDone: 1,
          foldersTotal: 1,
        },
        initialSyncDoneAt: "2026-11-05T08:00:00Z",
        pendingOps: 0,
        deadOps: 0,
        capabilities: [],
        keywordsSupported: true,
        missingRoles: [],
        folders: [],
      }),
    ),
    http.get("*/api/v1/threads", ({ request }) => {
      const url = new URL(request.url);
      const labelId = url.searchParams.get("labelId");
      const cursor = url.searchParams.get("cursor");
      state.calls.threadPages.push(cursor);
      const rows = state.threads.filter((t) => !labelId || t.labelIds?.includes(labelId));
      const start = cursor ? Number(cursor) : 0;
      const end = start + state.pageSize;
      return HttpResponse.json({
        threads: rows.slice(start, end),
        nextCursor: end < rows.length ? String(end) : null,
        resultSizeEstimate: rows.length,
      });
    }),
    http.get("*/api/v1/threads/:id", ({ params }) => {
      const t = state.threads.find((x) => x.id === params.id);
      return t
        ? HttpResponse.json(detail(t))
        : HttpResponse.json({ status: 404, code: "not_found" }, { status: 404 });
    }),
    http.post("*/api/v1/threads/modify", async ({ request }) => {
      const body = (await request.json()) as {
        ids: string[];
        addLabelIds?: string[];
        removeLabelIds?: string[];
      };
      state.calls.modify.push(body);
      if (state.failModify) {
        return HttpResponse.json({ status: 500, title: "Internal Server Error" }, { status: 500 });
      }
      return HttpResponse.json(apply(body.ids, body.addLabelIds ?? [], body.removeLabelIds ?? []));
    }),
    http.post("*/api/v1/threads/trash", async ({ request }) => {
      const body = (await request.json()) as { ids: string[] };
      return HttpResponse.json(apply(body.ids, ["TRASH"], []));
    }),
    http.post("*/api/v1/operations/:id/undo", ({ params }) => {
      const id = String(params.id);
      state.calls.undo.push(id);
      const before = ops.get(id);
      if (!before) return HttpResponse.json({ status: 409, code: "undo_expired" }, { status: 409 });
      ops.delete(id);
      for (const t of state.threads) {
        const labelIds = before.get(t.id);
        if (!labelIds) continue;
        t.labelIds = labelIds;
        t.unreadCount = labelIds.includes("UNREAD") ? 1 : 0;
      }
      return HttpResponse.json({
        operationId: null,
        undoUntil: null,
        threads: state.threads.filter((t) => before.has(t.id)),
      });
    }),
    http.get(
      "*/api/v1/messages/:id/html",
      () => new HttpResponse(state.html, { headers: { "Content-Type": "text/html" } }),
    ),
  ];

  /** Reverts an operation on the "server" without a client request (write-back gave up). */
  const revert = (operationId: string) => {
    const before = ops.get(operationId);
    for (const t of state.threads) {
      const labelIds = before?.get(t.id);
      if (labelIds) t.labelIds = labelIds;
    }
  };

  return { state, handlers, revert };
}
