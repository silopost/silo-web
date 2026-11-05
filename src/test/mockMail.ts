import { http, HttpResponse } from "msw";
import type {
  Address,
  ContactSuggestion,
  Draft,
  Label,
  Session,
  SnoozePreset,
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
  syncNow?: boolean;
};

/** A problem answered by the fake server, with the extension fields of plan 5.3. */
type FakeProblem = {
  status: number;
  code: string;
  limit?: number;
  size?: number;
  address?: string;
  field?: "to" | "cc" | "bcc";
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
      desktopNotifications: false,
      updatedAt: null,
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
        position: 0,
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
    scheduledAt: null,
    outboundId: null,
    pendingSync: false,
    draftId: null,
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
    /** GET /meta maxAttachmentBytes; null = maxUploadBytes. */
    metaMaxAttachmentBytes: null as number | null,
    /** Problem answered by the next POST /drafts/{id}/send. */
    sendProblem: null as FakeProblem | null,
    /** Search history (GET /search/suggest kind history), newest first. */
    searchHistory: ["faktura", "from:jan@firma.pl"],
    /** Extra fields of a search answer (indexing, approximate, resultSizeEstimate). */
    searchExtra: {} as {
      indexing?: { done: number };
      approximate?: boolean;
      resultSizeEstimate?: number;
    },
    /** GET /snooze/presets. */
    snoozePresets: [
      { key: "later_today", label: "Later today", until: "2026-11-05T17:00:00Z" },
      { key: "tomorrow", label: "Tomorrow", until: "2026-11-06T07:00:00Z" },
      { key: "this_weekend", label: "This weekend", until: "2026-11-07T07:00:00Z" },
      { key: "next_week", label: "Next week", until: "2026-11-09T07:00:00Z" },
    ] as SnoozePreset[],
    calls: {
      createDraft: [] as { accountId?: string; replyToMessageId?: string; mode?: string }[],
      putDraft: [] as (DraftPut & { id: string })[],
      deleteDraft: [] as string[],
      getDraft: [] as string[],
      meta: 0,
      send: [] as string[],
      cancel: [] as string[],
      uploads: [] as string[],
      contacts: [] as string[],
      modify: [] as { ids: string[]; addLabelIds?: string[]; removeLabelIds?: string[] }[],
      undo: [] as string[],
      threadPages: [] as (string | null)[],
      searches: [] as { q: string; labelId: string | null }[],
      suggest: [] as string[],
      deleteHistory: [] as (string | null)[],
      snooze: [] as { id: string; until: string }[],
      unsnooze: [] as string[],
      sendAt: [] as (string | undefined)[],
      login: [] as { email: string; password: string }[],
    },
  };
  /** Labels (and wake time, for snooze) of each thread before an operation, for its undo. */
  type Before = string[] | { labelIds: string[]; snoozedUntil: string | null };
  const ops = new Map<string, Map<string, Before>>();
  let opSeq = 0;

  const labels = (): Label[] =>
    ["INBOX", "STARRED", "SNOOZED", "SENT", "SCHEDULED", "DRAFT", "SPAM", "TRASH"].map((id, i) => {
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
    snoozedUntil: t.snoozedUntil,
    scheduledAt: t.scheduledAt,
    outboundId: t.outboundId,
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
      draftId: m === 2 && t.labelIds?.includes("DRAFT") ? `d_${t.id}_2` : null,
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
                thumbnail: false,
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
  const problem = (status: number, code: string, extra: object = {}) =>
    HttpResponse.json({ status, code, title: "Error", detail: code, ...extra }, { status });

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
      lastSend: null,
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

  /** A thread in Drafts whose second message is a draft (Thread.draftId, Message.draftId). */
  const addDraftThread = (n: number, extra: Partial<Draft> = {}) => {
    const id = `d_t_${n}_2`;
    state.threads.push(thread(n, { labelIds: ["DRAFT"], subject: `Szkic ${n}`, draftId: id }));
    const d = newDraft({});
    state.drafts.delete(d.id);
    state.drafts.set(id, {
      ...d,
      id,
      messageId: `m_t_${n}_2`,
      subject: `Szkic ${n}`,
      ...extra,
    });
    return id;
  };

  const unauthorized = () =>
    HttpResponse.json(
      { status: 401, code: "unauthorized", title: "Unauthorized" },
      { status: 401 },
    );

  const handlers = [
    http.get("*/api/v1/meta", () => {
      state.calls.meta += 1;
      return HttpResponse.json({
        serverVersion: "0.3.0",
        apiVersion: "1",
        minWebVersion: "0.3.0",
        authMode: "imap",
        allowCustomServers: false,
        maxAttachmentBytes: state.metaMaxAttachmentBytes ?? state.maxUploadBytes,
      });
    }),
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
      const q = url.searchParams.get("q");
      state.calls.threadPages.push(cursor);
      let rows = state.threads.filter((t) => !labelId || t.labelIds?.includes(labelId));
      if (q !== null) {
        state.calls.searches.push({ q, labelId });
        // A closing bracket without its opening one, as the real server refuses it.
        if (/^[^(]*\)/.test(q)) return problem(422, "invalid_query");
        // Plain words match the subject or snippet; operators are ignored by this fake.
        const words = q.split(/\s+/).filter((w) => w && !w.includes(":"));
        rows = rows.filter((t) =>
          words.every((w) => `${t.subject} ${t.snippet}`.toLowerCase().includes(w.toLowerCase())),
        );
      }
      const start = cursor ? Number(cursor) : 0;
      const end = start + state.pageSize;
      return HttpResponse.json({
        threads: rows.slice(start, end),
        nextCursor: end < rows.length ? String(end) : null,
        resultSizeEstimate: rows.length,
        ...(q !== null ? state.searchExtra : {}),
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
        const prev = before.get(t.id);
        if (!prev) continue;
        const labelIds = Array.isArray(prev) ? prev : prev.labelIds;
        if (!Array.isArray(prev)) t.snoozedUntil = prev.snoozedUntil;
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
      state.calls.getDraft.push(String(params.id));
      const d = state.drafts.get(String(params.id));
      return d ? HttpResponse.json(d) : problem(404, "not_found");
    }),
    http.put("*/api/v1/drafts/:id", async ({ params, request }) => {
      const id = String(params.id);
      const body = (await request.json()) as DraftPut;
      state.calls.putDraft.push({ ...body, id });
      const d = state.drafts.get(id);
      if (!d) return problem(404, "not_found");
      if (body.version !== d.version) {
        return problem(409, "draft_version_conflict", { currentVersion: d.version, current: d });
      }
      const bad = (["to", "cc", "bcc"] as const).flatMap((field) =>
        (body[field] ?? [])
          .filter((a) => a.email.endsWith(".invalid"))
          .map((a) => ({ field, address: a.email })),
      )[0];
      if (bad) return problem(400, "validation_failed", bad);
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
        syncedVersion: body.syncNow ? d.version + 1 : d.syncedVersion,
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
    http.post("*/api/v1/drafts/:id/send", async ({ params, request }) => {
      const id = String(params.id);
      state.calls.send.push(id);
      const sendBody = (await request.json().catch(() => ({}))) as { sendAt?: string };
      state.calls.sendAt.push(sendBody.sendAt);
      const d = state.drafts.get(id);
      if (!d) return problem(404, "not_found");
      if (state.sendProblem) {
        const { status, code, ...extra } = state.sendProblem;
        return problem(status, code, extra);
      }
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
      if (file.size > state.maxUploadBytes) {
        return problem(413, "upload_too_large", { limit: state.maxUploadBytes, size: file.size });
      }
      const info: UploadInfo = {
        id: `u_${++uploadSeq}`,
        filename: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
        cid: null,
        inline: false,
        thumbnail: false,
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
    http.get("*/api/v1/search/suggest", ({ request }) => {
      const q = new URL(request.url).searchParams.get("q") ?? "";
      state.calls.suggest.push(q);
      const history = state.searchHistory
        .filter((h) => h.startsWith(q))
        .slice(0, 5)
        .map((h) => ({ kind: "history" as const, text: h, label: h }));
      const last = q.split(" ").pop() ?? "";
      const head = q.slice(0, q.length - last.length);
      const contacts = last
        ? state.contacts
            .filter((c) => c.email.startsWith(last.replace(/^from:/, "")))
            .map((c) => ({
              kind: "contact" as const,
              text: `${head}from:${c.email}`,
              label: c.name ? `${c.name} <${c.email}>` : c.email,
            }))
        : [];
      const operators = last
        ? ["is:unread", "is:starred", "has:attachment", "in:inbox"]
            .filter((o) => o.startsWith(last) && o !== last)
            .map((o) => ({ kind: "operator" as const, text: `${head}${o}`, label: o }))
        : [];
      return HttpResponse.json({ suggestions: [...history, ...contacts, ...operators] });
    }),
    http.delete("*/api/v1/search/history", ({ request }) => {
      const query = new URL(request.url).searchParams.get("query");
      state.calls.deleteHistory.push(query);
      state.searchHistory = query === null ? [] : state.searchHistory.filter((h) => h !== query);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get("*/api/v1/snooze/presets", () =>
      HttpResponse.json({ timezone: "Europe/Warsaw", presets: state.snoozePresets }),
    ),
    http.post("*/api/v1/threads/:id/snooze", async ({ params, request }) => {
      const id = String(params.id);
      const { until } = (await request.json()) as { until: string };
      state.calls.snooze.push({ id, until });
      const t = state.threads.find((x) => x.id === id);
      if (!t) return problem(404, "not_found");
      const labelIds = t.labelIds ?? [];
      if (!labelIds.includes("INBOX") && !labelIds.includes("SNOOZED")) {
        return problem(409, "not_in_inbox");
      }
      const opId = `op_${++opSeq}`;
      ops.set(opId, new Map([[id, { labelIds, snoozedUntil: t.snoozedUntil }]]));
      t.labelIds = [...labelIds.filter((l) => l !== "INBOX" && l !== "SNOOZED"), "SNOOZED"];
      t.snoozedUntil = until;
      t.pendingSync = true;
      return HttpResponse.json({
        thread: t,
        operationId: opId,
        undoUntil: new Date(Date.now() + 10_000).toISOString(),
      });
    }),
    http.delete("*/api/v1/threads/:id/snooze", ({ params }) => {
      const id = String(params.id);
      state.calls.unsnooze.push(id);
      const t = state.threads.find((x) => x.id === id);
      if (!t) return problem(404, "not_found");
      if (!t.labelIds?.includes("SNOOZED")) return problem(409, "not_snoozed");
      t.labelIds = ["INBOX", ...t.labelIds.filter((l) => l !== "SNOOZED")];
      t.snoozedUntil = null;
      return HttpResponse.json({ thread: t, operationId: null, undoUntil: null });
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
      const prev = before?.get(t.id);
      if (prev) t.labelIds = Array.isArray(prev) ? prev : prev.labelIds;
    }
  };

  return { state, handlers, revert, saveElsewhere, addDraftThread };
}
