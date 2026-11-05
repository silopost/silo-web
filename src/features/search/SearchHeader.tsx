import { useNavigate } from "@tanstack/react-router";
import { Icon } from "../../components/Icon";
import { t } from "../../lib/i18n";
import { splitQuery, withoutPart } from "../../lib/searchText";
import { useAccountIndex } from "../account";

type Props = {
  q: string;
  /** indexing of the first page (plan 3.12): how much of the mail has its body indexed. */
  indexing: { done: number } | undefined;
  /** The search hit the server's time limit: the page is empty. */
  approximate: boolean;
  /** resultSizeEstimate of the first page (at most 2000). */
  estimate: number | undefined;
};

/**
 * SearchChips (plan 6.3): the parts of the query, as the user typed them, each with a remove
 * button. A part is text between spaces outside quotes and brackets; removing it removes that
 * text from q. Nothing is interpreted (plan 2.6): the server parses the query.
 */
export function SearchChips({ q }: { q: string }) {
  const navigate = useNavigate();
  const account = useAccountIndex();
  const parts = splitQuery(q);
  if (parts.length === 0) return null;
  const remove = (i: number) => {
    const next = withoutPart(q, i);
    if (next) void navigate({ to: "/u/$account/search", params: { account }, search: { q: next } });
    else void navigate({ to: "/u/$account/$label", params: { account, label: "inbox" } });
  };
  return (
    <ul aria-label={t.queryParts} className="flex flex-wrap items-center gap-2">
      {parts.map((part, i) => (
        <li
          key={`${i}:${part}`}
          className="flex items-center gap-1 rounded-lg border border-line py-0.5 pr-1 pl-3 text-sm"
        >
          <span className="max-w-64 truncate">{part}</span>
          <button
            type="button"
            aria-label={t.removeQueryPart(part)}
            onClick={() => remove(i)}
            className="flex size-6 items-center justify-center rounded-full text-ink-muted hover:bg-hover"
          >
            <Icon name="close" size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Above the results: chips, the result estimate and the indexing / time-limit banners. */
export function SearchHeader({ q, indexing, approximate, estimate }: Props) {
  const pct = indexing && indexing.done < 1 ? Math.floor(indexing.done * 100) : null;
  return (
    <div className="flex shrink-0 flex-col gap-2 px-4 pt-3">
      <div className="flex items-center gap-3">
        <SearchChips q={q} />
        {estimate !== undefined && !approximate && (
          <span className="ml-auto shrink-0 text-xs text-ink-muted">
            {t.resultEstimate(estimate)}
          </span>
        )}
      </div>
      {/* Announced politely (plan 6.7); the region stays mounted so that changes are read. */}
      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        {pct !== null && (
          <p className="rounded bg-warn-bg px-3 py-1.5 text-sm text-warn-ink">{t.indexing(pct)}</p>
        )}
        {approximate && (
          <p className="rounded bg-warn-bg px-3 py-1.5 text-sm text-warn-ink">{t.approximate}</p>
        )}
      </div>
    </div>
  );
}
