import { ImapFlow } from "imapflow";
import { e2eEnv, type DevAccount } from "./env";

/**
 * A second IMAP client next to Silo, as Thunderbird would be (plan 7, Faza 3 DoD): the e2e tests
 * check the mail server's state with it and put test messages in place with APPEND.
 */
export async function withImap<T>(
  account: DevAccount,
  fn: (c: ImapFlow) => Promise<T>,
): Promise<T> {
  const env = e2eEnv();
  const client = new ImapFlow({
    host: env.imapHost,
    port: env.imapPort,
    secure: false,
    doSTARTTLS: false,
    auth: { user: account.email, pass: account.password },
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

export type Role = "inbox" | "sent" | "drafts" | "archive" | "trash" | "snoozed";

const SPECIAL_USE: Partial<Record<Exclude<Role, "inbox">, string>> = {
  sent: "\\Sent",
  drafts: "\\Drafts",
  archive: "\\Archive",
  trash: "\\Trash",
};
const NAMES: Record<Exclude<Role, "inbox">, string> = {
  sent: "Sent",
  drafts: "Drafts",
  archive: "Archive",
  trash: "Trash",
  // Created by Silo on the first snooze; there is no SPECIAL-USE attribute for it.
  snoozed: "Snoozed",
};

/** Folder path of a role (SPECIAL-USE, else the usual name); null when the folder is missing. */
export async function folderOf(c: ImapFlow, role: Role): Promise<string | null> {
  if (role === "inbox") return "INBOX";
  const list = await c.list();
  const use = SPECIAL_USE[role];
  const byUse = use ? list.find((f) => f.specialUse === use) : undefined;
  if (byUse) return byUse.path;
  return list.find((f) => f.path.toLowerCase() === NAMES[role].toLowerCase())?.path ?? null;
}

export type FoundMessage = {
  uid: number;
  flags: string[];
  subject: string;
  messageId: string;
  inReplyTo: string;
  references: string;
  source: string;
};

/** Messages of a folder whose subject contains `subject` (IMAP SEARCH SUBJECT). */
export async function findMessages(
  account: DevAccount,
  role: Role,
  subject: string,
): Promise<FoundMessage[]> {
  return withImap(account, async (c) => {
    const path = await folderOf(c, role);
    if (!path) return [];
    const lock = await c.getMailboxLock(path, { readOnly: true });
    try {
      const uids = await c.search({ subject }, { uid: true });
      if (!uids || uids.length === 0) return [];
      const out: FoundMessage[] = [];
      for await (const m of c.fetch(
        uids,
        { uid: true, flags: true, source: true, envelope: true },
        { uid: true },
      )) {
        const source = m.source?.toString("utf8") ?? "";
        const header = (name: string) =>
          new RegExp(`^${name}:\\s*([^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*)`, "im")
            .exec(source)?.[1]
            ?.replace(/\r?\n[ \t]+/g, " ")
            .trim() ?? "";
        out.push({
          uid: m.uid,
          flags: [...(m.flags ?? [])],
          subject: m.envelope?.subject ?? "",
          messageId: m.envelope?.messageId ?? header("Message-ID"),
          inReplyTo: header("In-Reply-To"),
          references: header("References"),
          source,
        });
      }
      return out;
    } finally {
      lock.release();
    }
  });
}

/** Polls until `check` returns a value (not undefined/false) or the timeout passes. */
export async function waitUntil<T>(
  check: () => Promise<T | undefined | false>,
  timeoutMs: number,
  intervalMs = 500,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await check();
    if (v !== undefined && v !== false) return v;
    if (Date.now() > deadline) throw new Error(`waitUntil: timed out after ${timeoutMs} ms`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Waits until a folder holds a message with the subject; returns the time it was seen. */
export async function waitForMessage(
  account: DevAccount,
  role: Role,
  subject: string,
  timeoutMs: number,
  predicate: (m: FoundMessage) => boolean = () => true,
): Promise<{ at: number; messages: FoundMessage[] }> {
  return waitUntil(async () => {
    const messages = await findMessages(account, role, subject);
    return messages.some(predicate) ? { at: Date.now(), messages } : undefined;
  }, timeoutMs);
}

export type TestMessage = {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  messageId?: string;
  inReplyTo?: string;
  date?: Date;
  /** Extra header fields (name → value), e.g. Cc or List-Id. */
  headers?: Record<string, string>;
  /** Files of a multipart/mixed message (sent base64-encoded). */
  attachments?: TestAttachment[];
};

export type TestAttachment = { filename: string; contentType: string; content: string };

/** An RFC 5322 message (CRLF) for APPEND. */
export function rawMessage(m: TestMessage): string {
  const id = m.messageId ?? `<e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@silo.test>`;
  const head = [
    `From: ${m.from}`,
    `To: ${m.to}`,
    `Subject: ${m.subject}`,
    `Date: ${(m.date ?? new Date()).toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: ${id}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`, `References: ${m.inReplyTo}`] : []),
    ...Object.entries(m.headers ?? {}).map(([k, v]) => `${k}: ${v}`),
    "MIME-Version: 1.0",
  ];
  const body = m.html
    ? [`Content-Type: text/html; charset=utf-8`, "Content-Transfer-Encoding: 8bit", "", m.html]
    : [
        `Content-Type: text/plain; charset=utf-8`,
        "Content-Transfer-Encoding: 8bit",
        "",
        m.text ?? "",
      ];
  const files = m.attachments ?? [];
  if (files.length === 0) {
    return [...head, ...body].join("\r\n").replace(/\r?\n/g, "\r\n") + "\r\n";
  }
  const boundary = `e2e-${Math.random().toString(36).slice(2)}`;
  const parts = [
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    ...body,
    ...files.flatMap((f) => [
      `--${boundary}`,
      `Content-Type: ${f.contentType}; name="${f.filename}"`,
      `Content-Disposition: attachment; filename="${f.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      ...(Buffer.from(f.content, "utf8")
        .toString("base64")
        .match(/.{1,76}/g) ?? [""]),
    ]),
    `--${boundary}--`,
  ];
  return [...head, ...parts].join("\r\n").replace(/\r?\n/g, "\r\n") + "\r\n";
}

/** APPENDs a test message (as if delivered) to a folder of the account. */
export async function appendMessage(
  account: DevAccount,
  role: Role,
  m: TestMessage,
  flags: string[] = [],
): Promise<void> {
  await withImap(account, async (c) => {
    const path = await folderOf(c, role);
    if (!path) throw new Error(`no ${role} folder for ${account.email}`);
    await c.append(path, rawMessage(m), flags, m.date ?? new Date());
  });
}

/** Every folder that holds a message with the subject (any folder, as a second client sees it). */
export async function findEverywhere(
  account: DevAccount,
  subject: string,
): Promise<{ folder: string; uid: number; flags: string[] }[]> {
  return withImap(account, async (c) => {
    const out: { folder: string; uid: number; flags: string[] }[] = [];
    for (const f of await c.list()) {
      if (f.flags?.has("\\Noselect")) continue;
      const lock = await c.getMailboxLock(f.path, { readOnly: true });
      try {
        const uids = await c.search({ subject }, { uid: true });
        if (!uids || uids.length === 0) continue;
        for await (const m of c.fetch(uids, { uid: true, flags: true }, { uid: true })) {
          out.push({ folder: f.path, uid: m.uid, flags: [...(m.flags ?? [])] });
        }
      } finally {
        lock.release();
      }
    }
    return out;
  });
}

/** Messages of a folder by their Message-ID header (with the angle brackets). */
export async function findByMessageId(
  account: DevAccount,
  role: Role,
  messageId: string,
): Promise<{ uid: number; flags: string[] }[]> {
  return withImap(account, async (c) => {
    const path = await folderOf(c, role);
    if (!path) return [];
    const lock = await c.getMailboxLock(path, { readOnly: true });
    try {
      const uids = await c.search({ header: { "message-id": messageId } }, { uid: true });
      if (!uids || uids.length === 0) return [];
      const out: { uid: number; flags: string[] }[] = [];
      for await (const m of c.fetch(uids, { uid: true, flags: true }, { uid: true })) {
        out.push({ uid: m.uid, flags: [...(m.flags ?? [])] });
      }
      return out;
    } finally {
      lock.release();
    }
  });
}

/**
 * UID STORE +FLAGS / -FLAGS on the messages of a folder with the subject, as another client
 * would (Thunderbird's tags are IMAP keywords). Returns how many messages were changed.
 */
export async function storeFlags(
  account: DevAccount,
  role: Role,
  subject: string,
  change: { add?: string[]; remove?: string[] },
): Promise<number> {
  return withImap(account, async (c) => {
    const path = await folderOf(c, role);
    if (!path) throw new Error(`no ${role} folder for ${account.email}`);
    const lock = await c.getMailboxLock(path);
    try {
      const uids = await c.search({ subject }, { uid: true });
      if (!uids || uids.length === 0) return 0;
      if (change.add?.length) await c.messageFlagsAdd(uids, change.add, { uid: true });
      if (change.remove?.length) await c.messageFlagsRemove(uids, change.remove, { uid: true });
      return uids.length;
    } finally {
      lock.release();
    }
  });
}

/** Whether IMAP flags hold the keyword (keywords compare case-insensitively). */
export const hasKeyword = (flags: string[], keyword: string) =>
  flags.some((f) => f.toLowerCase() === keyword.toLowerCase());

/** Deletes every message whose subject contains `tag` from all folders of the account. */
export async function deleteTagged(account: DevAccount, tag: string): Promise<number> {
  return withImap(account, async (c) => {
    let n = 0;
    for (const f of await c.list()) {
      if (f.flags?.has("\\Noselect")) continue;
      const lock = await c.getMailboxLock(f.path);
      try {
        const uids = await c.search({ subject: tag }, { uid: true });
        if (uids && uids.length > 0) {
          await c.messageDelete(uids, { uid: true });
          n += uids.length;
        }
      } finally {
        lock.release();
      }
    }
    return n;
  });
}

/** A unique marker for the subjects of one test run, so that cleanup finds exactly its mail. */
export const runTag = (name: string) =>
  `[e2e ${name} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}]`;

/** The message text with base64 and quoted-printable parts decoded (for content checks). */
export function decodedText(source: string): string {
  const out: string[] = [];
  for (const part of source.split(/\r?\n--[^\r\n]+\r?\n/)) {
    const sep = part.search(/\r?\n\r?\n/);
    if (sep < 0) continue;
    const head = part.slice(0, sep);
    const body = part.slice(sep).trim();
    const cte = /content-transfer-encoding:\s*([\w-]+)/i.exec(head)?.[1]?.toLowerCase();
    if (cte === "base64")
      out.push(Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8"));
    else if (cte === "quoted-printable") {
      const bytes = body
        .replace(/=\r?\n/g, "")
        .replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
      out.push(Buffer.from(bytes, "latin1").toString("utf8"));
    } else out.push(body);
  }
  return out.join("\n");
}
