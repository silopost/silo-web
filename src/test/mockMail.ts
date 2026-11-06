import { http, HttpResponse } from "msw";
import type {
  Account,
  Address,
  ConnectionParams,
  ContactSuggestion,
  Discovery,
  Draft,
  Filter,
  FilterBody,
  Label,
  MessageAttachment,
  Session,
  Settings,
  SnoozePreset,
  Thread,
  TestResult,
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
  accountId?: string;
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
    user: {
      id: "u_1",
      email: "dev1@silo.test",
      displayName: "Dev One",
      isAdmin: false,
      totpEnabled: false,
    },
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
        authType: "password",
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
    /** User and folder labels (GET /labels after the system ones). */
    extraLabels: [] as Label[],
    /** sync-status deadOps of every account. */
    deadOps: 0,
    /** sync-status keywordsSupported. */
    keywordsSupported: true,
    filters: [] as Filter[],
    /** matchedEstimate of POST /filters/{id}/apply. */
    applyEstimate: 12 as number | null,
    /** Problem answered by the next POST /accounts/{id}/resync. */
    resyncProblem: null as FakeProblem | null,
    /** Attachments of the second message of every thread (default: oferta.pdf). */
    messageAttachments: null as MessageAttachment[] | null,
    /** Fields of the next draft created with mode forward (attachments, warnings). */
    forwardExtra: {} as Partial<Draft>,
    /** Problem answered by PATCH /settings, per field. */
    settingsProblem: {} as Record<string, FakeProblem>,
    /** Problem answered by PATCH /labels/{id} when the body has a parentId. */
    labelParentProblem: null as FakeProblem | null,
    /** GET /meta versions, oauthProviders and allowCustomServers. */
    serverVersion: "0.3.0",
    minWebVersion: "0.3.0",
    oauthProviders: [] as string[],
    allowCustomServers: false,
    /** GET /meta authMode (createLocalMock switches it to local). */
    authMode: "imap" as "imap" | "local",
    /** Answer of POST /accounts/discover (null: the default server of the instance). */
    discovery: null as Discovery | null,
    /** Problems answered by discover and POST /accounts; testFails fails the IMAP login step. */
    discoverProblem: null as FakeProblem | null,
    testFails: false,
    createProblem: null as FakeProblem | null,
    /** Label counts of accounts other than acc_1: accountId → label id → counts. */
    accountCounts: {} as Record<string, Record<string, { unread: number; total: number }>>,
    calls: {
      labelsGet: [] as string[],
      discover: [] as string[],
      accountTest: [] as ConnectionParams[],
      accountCreate: [] as (ConnectionParams & { displayName?: string })[],
      accountPatch: [] as { id: string; password?: string }[],
      accountDelete: [] as string[],
      oauthStart: [] as { provider: string; returnTo?: string; accountId?: string }[],
      settings: [] as Record<string, unknown>[],
      labelsCreate: [] as Record<string, unknown>[],
      labelsPatch: [] as (Record<string, unknown> & { id: string })[],
      labelsDelete: [] as string[],
      filtersCreate: [] as FilterBody[],
      filtersPut: [] as (FilterBody & { id: string })[],
      filtersDelete: [] as string[],
      filtersApply: [] as string[],
      resync: [] as { id: string; mode: string }[],
      uploadInline: [] as boolean[],
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

  const counted = (l: Label): Label => {
    const inLabel = state.threads.filter((t) => t.labelIds?.includes(l.id));
    return {
      ...l,
      threadsTotal: inLabel.length,
      threadsUnread: inLabel.filter((t) => t.unreadCount > 0).length,
    };
  };

  /** A user or folder label as GET /labels lists it. */
  const makeLabel = (id: string, name: string, extra: Partial<Label> = {}): Label => ({
    id,
    accountId: "acc_1",
    name,
    type: "user",
    colorBg: null,
    colorText: null,
    folderId: null,
    keywordState: "mirrored",
    localOnlyFolders: null,
    parentId: null,
    position: 0,
    showInList: "show",
    threadsTotal: 0,
    threadsUnread: 0,
    ...extra,
  });
  let labelSeq = 0;
  let filterSeq = 0;

  /**
   * GET /labels?accountId=: the threads of the fake belong to acc_1; another account's labels
   * are empty except for the counts set in state.accountCounts.
   */
  const labels = (accountId = "acc_1"): Label[] => [
    ...["INBOX", "STARRED", "SNOOZED", "SENT", "SCHEDULED", "DRAFT", "SPAM", "TRASH"].map(
      (id, i) => {
        const inLabel =
          accountId === "acc_1" ? state.threads.filter((t) => t.labelIds?.includes(id)) : [];
        const other = state.accountCounts[accountId]?.[id];
        return {
          id,
          accountId,
          name: id,
          type: "system",
          colorBg: null,
          colorText: null,
          folderId: null,
          keywordState: null,
          parentId: null,
          position: i,
          showInList: "show",
          threadsTotal: other?.total ?? inLabel.length,
          threadsUnread: other?.unread ?? inLabel.filter((t) => t.unreadCount > 0).length,
        } satisfies Label;
      },
    ),
    ...(accountId === "acc_1" ? state.extraLabels.map(counted) : []),
  ];

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
          ? (state.messageAttachments ?? [
              {
                id: "a_1",
                filename: "oferta.pdf",
                contentType: "application/pdf",
                size: 284113,
                inline: false,
                downloaded: true,
                thumbnail: false,
              },
            ])
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

  const filterActions = (body: FilterBody) => ({
    archive: body.actions.archive ?? false,
    markRead: body.actions.markRead ?? false,
    star: body.actions.star ?? false,
    important: body.actions.important ?? false,
    trash: body.actions.trash ?? false,
    addLabelIds: body.actions.addLabelIds ?? [],
    forwardTo: body.actions.forwardTo || null,
  });

  /** The server's 422s of a filter: query syntax (as the search fake), no action, archive+trash. */
  const filterProblem = (body: FilterBody) => {
    if (/^[^(]*\)/.test(body.criteria)) return problem(422, "invalid_query");
    const a = filterActions(body);
    const any =
      a.archive || a.markRead || a.star || a.important || a.trash || a.addLabelIds.length > 0;
    if (!body.criteria.trim() || !(any || a.forwardTo) || (a.archive && a.trash)) {
      return problem(422, "invalid_filter");
    }
    return null;
  };

  /** position (0-based) moves the filter and shifts the others, as the server does. */
  const moveFilter = (f: Filter, position: number) => {
    const rest = state.filters.filter((x) => x !== f).sort((a, b) => a.position - b.position);
    rest.splice(Math.max(0, Math.min(position, rest.length)), 0, f);
    rest.forEach((x, i) => (x.position = i));
    state.filters = rest;
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
      accountId: (!body.replyToMessageId && body.accountId) || "acc_1",
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
      if (forward) Object.assign(d, state.forwardExtra);
      for (const a of d.attachments ?? []) state.uploads.set(a.id, a);
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
        serverVersion: state.serverVersion,
        apiVersion: "1",
        minWebVersion: state.minWebVersion,
        authMode: state.authMode,
        allowCustomServers: state.allowCustomServers,
        maxAttachmentBytes: state.metaMaxAttachmentBytes ?? state.maxUploadBytes,
        oauthProviders: state.oauthProviders,
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
    http.get("*/api/v1/labels", ({ request }) => {
      const accountId = new URL(request.url).searchParams.get("accountId") ?? "acc_1";
      state.calls.labelsGet.push(accountId);
      return HttpResponse.json({ labels: labels(accountId) });
    }),
    http.post("*/api/v1/labels", async ({ request }) => {
      const body = (await request.json()) as {
        name: string;
        type: "user" | "folder";
        colorBg?: string;
        colorText?: string;
        parentId?: string;
      };
      state.calls.labelsCreate.push(body);
      if (state.extraLabels.some((l) => l.name === body.name && l.type === body.type)) {
        return problem(409, "label_exists");
      }
      const l = makeLabel(`l_new${++labelSeq}`, body.name, {
        type: body.type,
        colorBg: body.colorBg ?? null,
        colorText: body.colorText ?? null,
        parentId: body.parentId ?? null,
        keywordState:
          body.type === "user" ? (state.keywordsSupported ? "mirrored" : "local_only") : null,
      });
      state.extraLabels.push(l);
      return HttpResponse.json(l, { status: 201 });
    }),
    http.patch("*/api/v1/labels/:id", async ({ params, request }) => {
      const id = String(params.id);
      const body = (await request.json()) as Partial<Label>;
      state.calls.labelsPatch.push({ ...body, id });
      const l = state.extraLabels.find((x) => x.id === id);
      if (!l) return problem(404, "not_found");
      if ("parentId" in body && state.labelParentProblem) {
        return problem(state.labelParentProblem.status, state.labelParentProblem.code);
      }
      Object.assign(l, body);
      return HttpResponse.json(counted(l));
    }),
    http.delete("*/api/v1/labels/:id", ({ params }) => {
      const id = String(params.id);
      state.calls.labelsDelete.push(id);
      const l = state.extraLabels.find((x) => x.id === id);
      if (!l) return problem(404, "not_found");
      if (l.type === "folder" && state.threads.some((t) => t.labelIds?.includes(id))) {
        return problem(409, "folder_not_empty");
      }
      state.extraLabels = state.extraLabels.filter((x) => x.id !== id);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get("*/api/v1/settings", () => HttpResponse.json(session.settings)),
    http.patch("*/api/v1/settings", async ({ request }) => {
      const body = (await request.json()) as Partial<Settings>;
      state.calls.settings.push(body);
      for (const key of Object.keys(body)) {
        const p = state.settingsProblem[key];
        if (p) return problem(p.status, p.code);
      }
      session.settings = { ...session.settings, ...body, updatedAt: new Date().toISOString() };
      return HttpResponse.json(session.settings);
    }),
    http.get("*/api/v1/filters", () =>
      HttpResponse.json({ filters: [...state.filters].sort((a, b) => a.position - b.position) }),
    ),
    http.post("*/api/v1/filters", async ({ request }) => {
      const body = (await request.json()) as FilterBody;
      state.calls.filtersCreate.push(body);
      const bad = filterProblem(body);
      if (bad) return bad;
      const now = new Date().toISOString();
      const f: Filter = {
        id: `f_${++filterSeq}`,
        accountId: body.accountId ?? "acc_1",
        name: body.name ?? "",
        criteria: body.criteria,
        criteriaNormalized: body.criteria,
        actions: filterActions(body),
        enabled: body.enabled ?? true,
        position: state.filters.length,
        createdAt: now,
        updatedAt: now,
      };
      state.filters.push(f);
      if (body.position !== undefined) moveFilter(f, body.position);
      return HttpResponse.json(f, { status: 201 });
    }),
    http.put("*/api/v1/filters/:id", async ({ params, request }) => {
      const id = String(params.id);
      const body = (await request.json()) as FilterBody;
      state.calls.filtersPut.push({ ...body, id });
      const f = state.filters.find((x) => x.id === id);
      if (!f) return problem(404, "not_found");
      const bad = filterProblem(body);
      if (bad) return bad;
      Object.assign(f, {
        name: body.name ?? "",
        criteria: body.criteria,
        criteriaNormalized: body.criteria,
        actions: filterActions(body),
        enabled: body.enabled ?? true,
        updatedAt: new Date().toISOString(),
      });
      if (body.position !== undefined) moveFilter(f, body.position);
      return HttpResponse.json(f);
    }),
    http.delete("*/api/v1/filters/:id", ({ params }) => {
      const id = String(params.id);
      state.calls.filtersDelete.push(id);
      state.filters = state.filters.filter((x) => x.id !== id);
      state.filters.forEach((x, i) => (x.position = i));
      return new HttpResponse(null, { status: 204 });
    }),
    http.post("*/api/v1/filters/:id/apply", ({ params }) => {
      state.calls.filtersApply.push(String(params.id));
      return HttpResponse.json(
        { jobId: "j_1", matchedEstimate: state.applyEstimate },
        { status: 202 },
      );
    }),
    http.post("*/api/v1/accounts/discover", async ({ request }) => {
      const { email } = (await request.json()) as { email: string };
      state.calls.discover.push(email);
      if (state.discoverProblem) {
        const { status, code } = state.discoverProblem;
        return problem(status, code);
      }
      const d: Discovery = state.discovery ?? {
        email,
        domain: email.split("@")[1] ?? "",
        imap: { host: "mail.silo.test", port: 993, tls: "implicit" },
        smtp: { host: "mail.silo.test", port: 587, tls: "starttls" },
        username: email,
        loginFormat: "email",
        source: "default",
        sources: [{ source: "default", ok: true, detail: "default server" }],
        provider: "generic",
        params: {
          email,
          username: email,
          imapHost: "mail.silo.test",
          imapPort: 993,
          imapTls: "implicit",
          smtpHost: "mail.silo.test",
          smtpPort: 587,
          smtpTls: "starttls",
        },
      };
      return HttpResponse.json(d);
    }),
    http.post("*/api/v1/accounts/test", async ({ request }) => {
      const body = (await request.json()) as ConnectionParams;
      state.calls.accountTest.push(body);
      return HttpResponse.json(testResult());
    }),
    http.post("*/api/v1/accounts", async ({ request }) => {
      const body = (await request.json()) as ConnectionParams & { displayName?: string };
      state.calls.accountCreate.push(body);
      if (state.testFails) return problem(422, "account_test_failed", { test: testResult() });
      if (state.createProblem) {
        const { status, code } = state.createProblem;
        return problem(status, code);
      }
      const a = addAccount(session.accounts!.length + 1, {
        email: body.email ?? "",
        username: body.username ?? body.email ?? "",
        displayName: body.displayName ?? "",
        state: "connecting",
      });
      return HttpResponse.json(a, { status: 201 });
    }),
    http.patch("*/api/v1/accounts/:id", async ({ params, request }) => {
      const id = String(params.id);
      const body = (await request.json()) as { password?: string };
      state.calls.accountPatch.push({ id, ...body });
      const a = session.accounts!.find((x) => x.id === id);
      if (!a) return problem(404, "not_found");
      if (body.password && a.authType === "xoauth2") return problem(409, "not_available");
      if (body.password) a.state = "connecting";
      return HttpResponse.json(a);
    }),
    http.delete("*/api/v1/accounts/:id", ({ params }) => {
      const id = String(params.id);
      state.calls.accountDelete.push(id);
      const before = session.accounts!.length;
      session.accounts = session.accounts!.filter((x) => x.id !== id);
      return session.accounts.length < before
        ? new HttpResponse(null, { status: 204 })
        : problem(404, "not_found");
    }),
    http.post("*/api/v1/oauth/:provider/start", async ({ params, request }) => {
      const provider = String(params.provider);
      const body = (await request.json()) as { returnTo?: string; accountId?: string };
      state.calls.oauthStart.push({ provider, ...body });
      if (!state.oauthProviders.includes(provider)) return problem(404, "not_found");
      return HttpResponse.json({
        state: "st_1",
        url: `https://${provider}.example/auth?state=st_1`,
      });
    }),
    http.post("*/api/v1/accounts/:id/resync", async ({ params, request }) => {
      const { mode } = (await request.json()) as { mode: string };
      state.calls.resync.push({ id: String(params.id), mode });
      if (state.resyncProblem) {
        const { status, code } = state.resyncProblem;
        return problem(status, code);
      }
      return new HttpResponse(null, { status: 202 });
    }),
    http.get("*/api/v1/accounts/:id/sync-status", ({ params }) => {
      const a = session.accounts!.find((x) => x.id === params.id);
      return HttpResponse.json({
        id: String(params.id),
        email: a?.email ?? "dev1@silo.test",
        state: a?.state ?? "live",
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
        deadOps: state.deadOps,
        capabilities: [],
        keywordsSupported: state.keywordsSupported,
        missingRoles: [],
        folders: [],
      });
    }),
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
      // "Od": a new message moves to another account under new ids; replies are locked.
      let moved: Partial<Draft> = {};
      if (body.accountId && body.accountId !== d.accountId) {
        if (d.inReplyToMessageId) return problem(409, "draft_account_locked");
        const n = ++draftSeq;
        moved = {
          id: `d_${n}`,
          messageId: `m_${n}`,
          threadId: `t_d${n}`,
          accountId: body.accountId,
        };
        state.drafts.delete(id);
      }
      const next: Draft = {
        ...d,
        ...moved,
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
      state.drafts.set(next.id, next);
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
      // Request.formData() fails under jsdom (its File class); read the parts by hand.
      const boundary = /boundary=(.+)$/.exec(request.headers.get("content-type") ?? "")?.[1];
      const parts = (await request.text()).split(`--${boundary}`).slice(1);
      const inline =
        new URL(request.url).searchParams.get("inline") === "true" ||
        parts.some((p) => /name="inline"\r\n\r\ntrue/.test(p));
      state.calls.uploadInline.push(inline);
      const part = parts.find((p) => p.includes('name="file"')) ?? "";
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
      if (inline && !file.type.startsWith("image/")) return problem(422, "inline_not_image");
      const n = ++uploadSeq;
      const info: UploadInfo = {
        id: `u_${n}`,
        filename: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
        cid: inline ? `c${n}@silo` : null,
        inline,
        thumbnail: file.type.startsWith("image/"),
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

  /** POST /accounts/test: every stage passes, or the IMAP login fails (state.testFails). */
  const testResult = (): TestResult => ({
    imap: {
      ok: !state.testFails,
      steps: [
        { step: "connect", ok: true, ms: 3 },
        { step: "tls", ok: true, ms: 5 },
        state.testFails
          ? { step: "login", ok: false, ms: 9, detail: "AUTHENTICATIONFAILED" }
          : { step: "login", ok: true, ms: 9 },
      ],
    },
    smtp: {
      ok: true,
      steps: [
        { step: "connect", ok: true, ms: 2 },
        { step: "auth", ok: true, ms: 4 },
      ],
    },
  });

  /** A second (third…) account of the user, as GET /session lists it. */
  const addAccount = (n: number, extra: Partial<Account> = {}): Account => {
    const a: Account = {
      ...session.accounts![0]!,
      id: `acc_${n}`,
      email: `dev${n}@silo.test`,
      displayName: `Dev ${n}`,
      username: `dev${n}@silo.test`,
      position: session.accounts!.length,
      ...extra,
    };
    session.accounts!.push(a);
    return a;
  };

  return {
    state,
    session,
    handlers,
    revert,
    saveElsewhere,
    addDraftThread,
    makeLabel,
    addAccount,
  };
}
