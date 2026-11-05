import { rawMessage, withImap } from "./imap";
import type { DevAccount } from "./env";

export const BULK_PREFIX = "[e2e-bulk]";

/**
 * Makes sure the account's INBOX holds `count` separate threads of the bulk corpus (subjects
 * "[e2e-bulk] 00001 …"), APPENDing only the missing ones. The corpus is a fixture of the
 * performance test, kept between runs (dev3@ is not used by the other tests).
 */
export async function ensureBulkInbox(account: DevAccount, count: number): Promise<number> {
  return withImap(account, async (c) => {
    const lock = await c.getMailboxLock("INBOX");
    let added = 0;
    try {
      const have = new Set<number>();
      const uids = await c.search({ subject: BULK_PREFIX }, { uid: true });
      if (uids && uids.length > 0) {
        for await (const m of c.fetch(uids, { envelope: true }, { uid: true })) {
          const n = Number(/\[e2e-bulk\] (\d+)/.exec(m.envelope?.subject ?? "")?.[1]);
          if (n) have.add(n);
        }
      }
      const base = Date.UTC(2026, 9, 1);
      for (let n = 1; n <= count; n++) {
        if (have.has(n)) continue;
        const date = new Date(base + n * 60_000);
        const raw = rawMessage({
          from: `Nadawca ${n % 97} <nadawca${n % 97}@example.com>`,
          to: account.email,
          subject: `${BULK_PREFIX} ${String(n).padStart(5, "0")} Raport tygodniowy ${n}`,
          text: `Treść wiadomości numer ${n}.\nLinia druga z dodatkowym tekstem do podglądu.`,
          messageId: `<e2e-bulk-${n}@example.com>`,
          date,
        });
        await c.append("INBOX", raw, n % 3 === 0 ? [] : ["\\Seen"], date);
        added++;
      }
    } finally {
      lock.release();
    }
    return added;
  });
}
