/** Filter of one thread list: a label view (labelId undefined = all mail) or a search. */
export type ListFilter = { labelId?: string; q?: string };

/** Query keys (plan 6.4). */
export const keys = {
  session: ["session"] as const,
  labels: (accountId: string) => ["labels", accountId] as const,
  threadsAll: (accountId: string) => ["threads", accountId] as const,
  threads: (accountId: string, filter: ListFilter) => ["threads", accountId, filter] as const,
  thread: (id: string) => ["thread", id] as const,
  syncStatus: (accountId: string) => ["syncStatus", accountId] as const,
  messageHtml: (id: string) => ["messageHtml", id] as const,
  draft: (id: string) => ["draft", id] as const,
  contacts: (q: string) => ["contacts", q] as const,
  searchSuggest: (accountId: string, q: string) => ["searchSuggest", accountId, q] as const,
  searchSuggestAll: ["searchSuggest"] as const,
  snoozePresets: ["snoozePresets"] as const,
  settings: ["settings"] as const,
  filters: (accountId: string) => ["filters", accountId] as const,
  sessions: ["sessions"] as const,
};
