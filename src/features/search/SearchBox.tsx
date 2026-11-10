import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { isApiError } from "../../api/errors";
import { keys } from "../../api/keys";
import { deleteSearchHistory, searchSuggestQuery } from "../../api/queries/search";
import type { SearchSuggestion } from "../../api/types";
import { Icon } from "../../components/Icon";
import { t } from "../../lib/i18n";
import { toast } from "../../state/toasts";
import { useAccountIndex, useActiveAccount } from "../account";
import { AdvancedSearchPopover } from "./AdvancedSearchPopover";

const DEBOUNCE_MS = 150;
const KINDS = ["history", "contact", "label", "operator"] as const;

/** 422 invalid_query of the search being shown, read from the list's query in the cache. */
function useInvalidQuery(accountId: string, q: string): boolean {
  const qc = useQueryClient();
  const key = keys.threads(accountId, { q });
  const error = useSyncExternalStore(
    (onChange) => qc.getQueryCache().subscribe(onChange),
    () => (q ? qc.getQueryState(key)?.error : null),
  );
  return isApiError(error) && error.code === "invalid_query";
}

/**
 * SearchBox (plan 6.3, 3.12): a text field without a parser. Suggestions come from
 * GET /search/suggest (history, contacts, labels, operators); accepting one puts its `text`, the
 * whole query, in the field. Enter searches: /u/<n>/search?q=. A combobox with a listbox
 * (plan 6.7): arrows move, Enter accepts, Esc leaves the field.
 */
export function SearchBox() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const account = useAccountIndex();
  const accountId = useActiveAccount()?.id ?? "";
  const current = (useSearch({ strict: false }) as { q?: string }).q ?? "";
  const [q, setQ] = useState(current);
  const [shown, setShown] = useState(current);
  // Follow the URL (e.g. navigation away from a search, a removed chip) without an effect.
  if (current !== shown) {
    setShown(current);
    setQ(current);
  }
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const errorId = useId();
  const invalid = useInvalidQuery(accountId, current);

  const suggest = useQuery({
    ...searchSuggestQuery(accountId, debounced),
    enabled: open && !!accountId,
  });
  const groups = KINDS.map((kind) => ({
    kind,
    items: (suggest.data?.suggestions ?? []).filter((s) => s.kind === kind),
  })).filter((g) => g.items.length > 0);
  const flat = groups.flatMap((g) => g.items);
  const expanded = open && flat.length > 0;
  const optionId = (i: number) => `${listId}-o${i}`;

  const search = (query: string) => {
    const text = query.trim();
    if (!text) return;
    setOpen(false);
    setActive(-1);
    void navigate({ to: "/u/$account/search", params: { account }, search: { q: text } });
    // The server saves the query in the history with the first page of results.
    void qc.invalidateQueries({ queryKey: keys.searchSuggestAll });
    input.current?.blur();
  };

  const accept = (s: SearchSuggestion) => {
    setQ(s.text);
    setActive(-1);
    // A recent query is a whole search; the other kinds complete the query being typed.
    if (s.kind === "history") search(s.text);
    else input.current?.focus();
  };

  const forget = async (query?: string) => {
    try {
      await deleteSearchHistory(accountId, query);
    } catch {
      toast(t.genericError);
    }
    setActive(-1);
    await qc.invalidateQueries({ queryKey: keys.searchSuggestAll });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    search(q);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const n = flat.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (n) setActive((a) => (a + 1) % n);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (n) setActive((a) => (a <= 0 ? n - 1 : a - 1));
    } else if (e.key === "Enter" && expanded && active >= 0 && flat[active]) {
      e.preventDefault();
      accept(flat[active]);
    } else if (e.key === "Delete" && e.shiftKey && expanded && flat[active]?.kind === "history") {
      e.preventDefault();
      void forget(flat[active].text);
    } else if (e.key === "Escape") {
      // Esc leaves the field (plan 6.6), so that the list shortcuts work again.
      e.preventDefault();
      setOpen(false);
      setActive(-1);
      e.currentTarget.blur();
    }
  };

  let index = -1;
  return (
    <form role="search" onSubmit={submit} className="relative max-w-2xl flex-1">
      <div className="flex h-12 items-center gap-3 rounded-full bg-search pr-1 pl-4 focus-within:bg-panel focus-within:shadow">
        <Icon name="search" size={22} className="text-ink-muted" />
        <input
          ref={input}
          id="search-input"
          type="search"
          role="combobox"
          aria-label={t.search}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          autoComplete="off"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder={t.search}
          maxLength={500}
          className="h-full flex-1 bg-transparent outline-none"
        />
        <AdvancedSearchPopover accountId={accountId} text={q} onSearch={search} />
      </div>
      {invalid && (
        <p
          id={errorId}
          role="alert"
          className="absolute top-full left-4 mt-1 text-sm text-error-ink"
        >
          {t.invalidQuery}
        </p>
      )}
      <div
        hidden={!expanded}
        // Clicks in the list must not blur the field (which closes the list).
        onMouseDown={(e) => e.preventDefault()}
        className="absolute top-full right-0 left-0 z-40 mt-1 overflow-hidden rounded-lg bg-raised py-2 shadow-lg"
      >
        <ul id={listId} role="listbox" aria-label={t.searchSuggestions}>
          {groups.map((g) => (
            <li key={g.kind} role="presentation">
              <div
                id={`${listId}-${g.kind}`}
                className="px-4 pt-2 pb-1 text-xs font-medium text-ink-muted"
              >
                {t.suggestionGroups[g.kind]}
              </div>
              <ul role="group" aria-labelledby={`${listId}-${g.kind}`}>
                {g.items.map((s) => {
                  const i = ++index;
                  return (
                    <li
                      key={`${s.kind}:${s.text}`}
                      role="presentation"
                      className="flex items-center"
                    >
                      <div
                        id={optionId(i)}
                        role="option"
                        aria-selected={i === active}
                        onClick={() => accept(s)}
                        className={`flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-1.5 ${
                          i === active ? "bg-hover" : "hover:bg-hover"
                        }`}
                      >
                        <Icon
                          name={s.kind === "history" ? "history" : "search"}
                          size={18}
                          className="shrink-0 text-ink-muted"
                        />
                        <span className="truncate">{s.label}</span>
                      </div>
                      {s.kind === "history" && (
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label={t.removeFromHistory(s.text)}
                          title={t.removeFromHistory(s.text)}
                          onClick={() => void forget(s.text)}
                          className="mr-2 flex size-7 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-hover"
                        >
                          <Icon name="close" size={16} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
        {!q.trim() && groups.some((g) => g.kind === "history") && (
          <div className="flex justify-end border-t border-line px-4 pt-2">
            <button
              type="button"
              tabIndex={-1}
              onClick={() => void forget()}
              className="text-sm font-medium text-primary"
            >
              {t.clearHistory}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
