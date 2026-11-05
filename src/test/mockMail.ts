import { http, HttpResponse } from "msw";
import type {
  Address,
  ContactSuggestion,
  Draft,
  Label,
  Session,
  Thread,
  ThreadDetail,
  UploadInfo,
} from "../api/types";

type DraftPut = {
  version: number;
  to: Address[] | null;
  cc?: Address[] | null;
  bcc?: Address[] | null;
  subject: string;
  bodyHtml: string;
  bodyJson?: unknown;
  attachmentIds?: string[] | null;
};

/** A small stateful silo-server for msw: threads with labels, modify, undo, drafts, sending. */
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
    drafts: new Map<string, Draft>(),
    uploads: new Map<string, UploadInfo>(),
    outbound: new Map<string, { draftId: string; status: "queued" | "sending" | "cancelled" }>(),
    contacts: [
      { name: "Jan Kowalski", email: "jan@firma.pl" },
      { name: "Janina Nowak", email: "janina@firma.pl" },
      { name: "", email: "jacek@example.com" },
    ] as ContactSuggestion[],
    /** Uploads larger than this are 413 upload_too_large. */
    maxUploadBytes: 1000,
    /** Problem answered by the next POST /drafts/{id}/send. */
    sendProblem: null as { status: number; code: string } | null,
    calls: {
      createDraft: [] as { accountId?: string; replyToMessageId?: string; mode?: string }[],
      putDraft: [] as (DraftPut & { id: string })[],
      deleteDraft: [] as string[],
      send: [] as string[],
      cancel: [] as string[],
      uploads: [] as string[],
      contacts: [] as string[],
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
      labelIds:
        m === 2 && t.labelIds?.includes("DRAFT")
          ? ["DRAFT"]
          : m === 2 && t.unreadCount > 0
            ? ["INBOX", "UNREAD"]
            : ["INBOX"],
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

  let draftSeq = 0;
  let uploadSeq = 0;
  let outboundSeq = 0;
  const problem = (status: number, code: string) =>
    HttpResponse.json({ status, code, title: "Error", detail: code }, { status });

  /** A draft as POST /drafts answers it; replies are prefilled as the server does. */
  const newDraft = (body: { accountId?: string; replyToMessageId?: string; mode?: string }) => {
    const n = ++draftSeq;
    const d: Draft = {
      id: `d_${n}`,
      messageId: `m_${n}`,
      accountId: "acc_1",
      threadId: `t_d${n}`,
      to: [],
      cc: [],
      bcc: [],
      subject: "",
      bodyHtml: "",
      bodyJson: null,
      attachments: [],
      inReplyToMessageId: body.replyToMessageId ?? null,
      serverChanged: false,
      syncedVersion: 0,
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    if (body.replyToMessageId) {
      const th = state.threads.find((x) => body.replyToMessageId!.startsWith(`m_${x.id}_`));
      const forward = body.mode === "forward";
      d.threadId = forward ? d.threadId : (th?.id ?? d.threadId);
      d.subject = `${forward ? "Fwd" : "Re"}: ${th?.subject ?? ""}`;
      d.to = forward ? [] : [{ name: "Nadawca 2", email: "osoba@firma.pl" }];
      d.cc = body.mode === "replyAll" ? [{ name: "Inna Osoba", email: "inna@firma.pl" }] : [];
      d.bodyHtml = "<p></p><blockquote><p>Cytowana treść</p></blockquote>";
    }
    state.drafts.set(d.id, d);
    return d;
  };

  /** Another tab or program saves the draft: its version grows. */
  const saveElsewhere = (id: string) => {
    const d = state.drafts.get(id)!;
    state.drafts.set(id, { ...d, version: d.version + 1, subject: "Zmieniony gdzie indziej" });
  };

  /** A thread in Drafts whose second message is a draft (d_ id = m_ id). */
  const addDraftThread = (n: number) => {
    state.threads.push(thread(n, { labelIds: ["DRAFT"], subject: `Szkic ${n}` }));
    const d = newDraft({});
    state.drafts.delete(d.id);
    const id = `d_t_${n}_2`;
    state.drafts.set(id, { ...d, id, messageId: `m_t_${n}_2`, subject: `Szkic ${n}` });
    return id;
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
    http.post("*/api/v1/drafts", async ({ request }) => {
      const body = (await request.json()) as Parameters<typeof newDraft>[0];
      state.calls.createDraft.push(body);
      return HttpResponse.json(newDraft(body), { status: 201 });
    }),
    http.get("*/api/v1/drafts/:id", ({ params }) => {
      const d = state.drafts.get(String(params.id));
      return d ? HttpResponse.json(d) : problem(404, "not_found");
    }),
    http.put("*/api/v1/drafts/:id", async ({ params, request }) => {
      const id = String(params.id);
      const body = (await request.json()) as DraftPut;
      state.calls.putDraft.push({ ...body, id });
      const d = state.drafts.get(id);
      if (!d) return problem(404, "not_found");
      if (body.version !== d.version) return problem(409, "draft_version_conflict");
      const addrs = (list: Address[] | null | undefined) =>
        (list ?? []).map((a) => ({ name: a.name ?? "", email: a.email }));
      const next: Draft = {
        ...d,
        to: addrs(body.to),
        cc: addrs(body.cc),
        bcc: addrs(body.bcc),
        subject: body.subject,
        bodyHtml: body.bodyHtml,
        bodyJson: body.bodyJson ?? null,
        attachments: (body.attachmentIds ?? []).map((u) => state.uploads.get(u)!),
        version: d.version + 1,
        updatedAt: new Date().toISOString(),
      };
      state.drafts.set(id, next);
      return HttpResponse.json(next);
    }),
    http.delete("*/api/v1/drafts/:id", ({ params }) => {
      const id = String(params.id);
      state.calls.deleteDraft.push(id);
      return state.drafts.delete(id)
        ? new HttpResponse(null, { status: 204 })
        : problem(404, "not_found");
    }),
    http.post("*/api/v1/drafts/:id/send", ({ params }) => {
      const id = String(params.id);
      state.calls.send.push(id);
      const d = state.drafts.get(id);
      if (!d) return problem(404, "not_found");
      if (state.sendProblem) return problem(state.sendProblem.status, state.sendProblem.code);
      if ([...(d.to ?? []), ...(d.cc ?? []), ...(d.bcc ?? [])].length === 0) {
        return problem(422, "no_recipients");
      }
      const ob = `ob_${++outboundSeq}`;
      state.outbound.set(ob, { draftId: id, status: "queued" });
      return HttpResponse.json({
        messageId: d.messageId,
        outboundId: ob,
        undoUntil: new Date(Date.now() + 5000).toISOString(),
      });
    }),
    http.post("*/api/v1/outbound/:id/cancel", ({ params }) => {
      const id = String(params.id);
      state.calls.cancel.push(id);
      const ob = state.outbound.get(id);
      if (!ob) return problem(404, "not_found");
      if (ob.status === "sending") return problem(409, "send_in_progress");
      ob.status = "cancelled";
      return HttpResponse.json(state.drafts.get(ob.draftId));
    }),
    http.post("*/api/v1/uploads", async ({ request }) => {
      // Request.formData() fails under jsdom (its File class); read the one part by hand.
      const boundary = /boundary=(.+)$/.exec(request.headers.get("content-type") ?? "")?.[1];
      const part = (await request.text()).split(`--${boundary}`)[1] ?? "";
      const head = part.slice(0, part.indexOf("\r\n\r\n"));
      const file = {
        name: /filename="([^"]*)"/.exec(head)?.[1] ?? "file",
        type: /Content-Type: (.+)/i.exec(head)?.[1]?.trim() ?? "",
        size: part.length - head.length - 6,
      };
      state.calls.uploads.push(file.name);
      if (file.size > state.maxUploadBytes) return problem(413, "upload_too_large");
      const info: UploadInfo = {
        id: `u_${++uploadSeq}`,
        filename: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      };
      state.uploads.set(info.id, info);
      return HttpResponse.json(info, { status: 201 });
    }),
    http.get("*/api/v1/contacts/autocomplete", ({ request }) => {
      const q = (new URL(request.url).searchParams.get("q") ?? "").toLowerCase();
      state.calls.contacts.push(q);
      const matches = (c: ContactSuggestion) =>
        c.email.startsWith(q) ||
        c.name
          .toLowerCase()
          .split(/\s+/)
          .some((w) => w.startsWith(q));
      return HttpResponse.json({ contacts: state.contacts.filter(matches) });
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

  return { state, handlers, revert, saveElsewhere, addDraftThread };
}
