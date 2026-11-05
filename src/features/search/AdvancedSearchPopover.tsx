import * as Popover from "@radix-ui/react-popover";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { useLabels } from "../../api/queries/labels";
import { IconButton } from "../../components/IconButton";
import { t } from "../../lib/i18n";
import {
  buildQuery,
  emptyAdvanced,
  quoteValue,
  type AdvancedFields,
  type SizeUnit,
} from "../../lib/searchText";
import { useAccountIndex } from "../account";

/** The filter editor (Faza 4, slice 7); "Utwórz filtr" opens it once the route exists. */
const FILTERS_PATH = "/u/$account/settings/filters";

/** "Szukaj w": text added to the query as is. */
const SEARCH_IN: [string, string][] = [
  ["", t.adv.allMail],
  ["in:inbox", "Odebrane"],
  ["is:starred", "Oznaczone gwiazdką"],
  ["in:sent", "Wysłane"],
  ["in:drafts", "Wersje robocze"],
  ["in:snoozed", "Odłożone"],
  ["in:spam", "Spam"],
  ["in:trash", "Kosz"],
  ["in:anywhere", t.adv.anywhere],
];

const field = "min-w-0 flex-1 border-b border-line bg-transparent px-1 py-1 outline-none";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-sm text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

type Props = {
  accountId: string;
  /** The text in the search box, prefilled as "Zawiera słowa" (as text, not parsed). */
  text: string;
  onSearch: (q: string) => void;
};

/**
 * AdvancedSearchPopover (plan 6.3): Gmail's search options. "Szukaj" joins the fields into the
 * text of q (`from:jan has:attachment …`); the server parses it like typed text.
 */
export function AdvancedSearchPopover({ accountId, text, onSearch }: Props) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<AdvancedFields>(emptyAdvanced);
  const labels = useLabels(accountId).filter((l) => l.type !== "system");
  const router = useRouter();
  const account = useAccountIndex();
  const filtersReady = FILTERS_PATH in (router.routesByPath as object);
  const set = <K extends keyof AdvancedFields>(key: K, value: AdvancedFields[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));
  const q = buildQuery(f);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!q) return;
    setOpen(false);
    onSearch(q);
  };

  const createFilter = () => {
    setOpen(false);
    router.history.push(
      `/u/${account}/settings/filters?criteria=${encodeURIComponent(q || text.trim())}`,
    );
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        // Each opening starts from the text in the box (Gmail fills the form from the query).
        if (next) setF({ ...emptyAdvanced, hasWords: text.trim() });
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <IconButton icon="tune" label={t.searchOptions} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          aria-label={t.advancedSearch}
          className="z-50 w-[min(40rem,95vw)] rounded-lg bg-panel p-6 shadow-xl"
        >
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Row label={t.adv.from}>
              <input
                className={field}
                value={f.from}
                onChange={(e) => set("from", e.target.value)}
              />
            </Row>
            <Row label={t.adv.to}>
              <input className={field} value={f.to} onChange={(e) => set("to", e.target.value)} />
            </Row>
            <Row label={t.adv.subject}>
              <input
                className={field}
                value={f.subject}
                onChange={(e) => set("subject", e.target.value)}
              />
            </Row>
            <Row label={t.adv.hasWords}>
              <input
                className={field}
                value={f.hasWords}
                onChange={(e) => set("hasWords", e.target.value)}
              />
            </Row>
            <Row label={t.adv.notWords}>
              <input
                className={field}
                value={f.notWords}
                onChange={(e) => set("notWords", e.target.value)}
              />
            </Row>
            <div className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-sm text-ink-muted">{t.adv.size}</span>
              <select
                aria-label={t.adv.size}
                value={f.sizeOp}
                onChange={(e) => set("sizeOp", e.target.value as AdvancedFields["sizeOp"])}
                className="rounded border border-line px-1 py-1"
              >
                <option value="larger">{t.adv.larger}</option>
                <option value="smaller">{t.adv.smaller}</option>
              </select>
              <input
                aria-label={t.adv.sizeValue}
                type="number"
                min={0}
                value={f.size}
                onChange={(e) => set("size", e.target.value)}
                className={`${field} w-20 flex-none`}
              />
              <select
                aria-label={t.adv.sizeUnit}
                value={f.sizeUnit}
                onChange={(e) => set("sizeUnit", e.target.value as SizeUnit)}
                className="rounded border border-line px-1 py-1"
              >
                <option value="M">MB</option>
                <option value="K">KB</option>
                <option value="">B</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-sm text-ink-muted">{t.date}</span>
              <label className="flex items-center gap-2 text-sm">
                {t.adv.after}
                <input
                  type="date"
                  value={f.after}
                  onChange={(e) => set("after", e.target.value)}
                  className="rounded border border-line px-1 py-1"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                {t.adv.before}
                <input
                  type="date"
                  value={f.before}
                  onChange={(e) => set("before", e.target.value)}
                  className="rounded border border-line px-1 py-1"
                />
              </label>
            </div>
            <Row label={t.adv.searchIn}>
              <select
                value={f.searchIn}
                onChange={(e) => set("searchIn", e.target.value)}
                className="rounded border border-line px-1 py-1"
              >
                {SEARCH_IN.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
                {labels.map((l) => (
                  <option key={l.id} value={`label:${quoteValue(l.name)}`}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Row>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.hasAttachment}
                onChange={(e) => set("hasAttachment", e.target.checked)}
                className="size-4 accent-primary"
              />
              {t.adv.hasAttachment}
            </label>
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                // Until the filter editor exists the button stays visible, disabled, with a hint.
                aria-disabled={!filtersReady}
                title={filtersReady ? undefined : t.adv.filtersSoon}
                onClick={filtersReady ? createFilter : undefined}
                className="rounded-full px-4 py-2 font-medium text-primary hover:bg-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              >
                {t.adv.createFilter}
              </button>
              <button
                type="submit"
                disabled={!q}
                className="rounded bg-primary px-6 py-2 font-medium text-white disabled:opacity-60"
              >
                {t.adv.search}
              </button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
