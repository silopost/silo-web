import * as Popover from "@radix-ui/react-popover";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { IconButton } from "../../components/IconButton";
import { t } from "../../lib/i18n";
import { buildQuery, emptyAdvanced, type AdvancedFields } from "../../lib/searchText";
import { useAccountIndex } from "../account";
import { AdvancedFieldsForm } from "./AdvancedFields";

type Props = {
  accountId: string;
  /** The text in the search box, prefilled as "Has the words" (as text, not parsed). */
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
  const navigate = useNavigate();
  const account = useAccountIndex();
  const q = buildQuery(f);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // React bubbles events through the portal: without this the search box's own form would
    // submit too and search for the box's text instead.
    e.stopPropagation();
    if (!q) return;
    setOpen(false);
    onSearch(q);
  };

  const createFilter = () => {
    setOpen(false);
    void navigate({
      to: "/u/$account/settings/filters",
      params: { account },
      search: { criteria: q || text.trim() },
    });
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
            <AdvancedFieldsForm accountId={accountId} value={f} onChange={setF} />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={!q && !text.trim()}
                onClick={createFilter}
                className="rounded-full px-4 py-2 font-medium text-primary hover:bg-hover disabled:opacity-50"
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
