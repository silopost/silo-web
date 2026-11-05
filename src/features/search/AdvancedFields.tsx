import type { ReactNode } from "react";
import { useLabels } from "../../api/queries/labels";
import { t } from "../../lib/i18n";
import { quoteValue, type AdvancedFields, type SizeUnit } from "../../lib/searchText";

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
  value: AdvancedFields;
  onChange: (next: AdvancedFields) => void;
};

/**
 * The fields of Gmail's search options, shared by AdvancedSearchPopover and the filter editor;
 * lib/searchText.buildQuery joins them into the text of a query (no parsing here).
 */
export function AdvancedFieldsForm({ accountId, value: f, onChange }: Props) {
  const labels = useLabels(accountId).filter((l) => l.type !== "system");
  const set = <K extends keyof AdvancedFields>(key: K, v: AdvancedFields[K]) =>
    onChange({ ...f, [key]: v });
  return (
    <>
      <Row label={t.adv.from}>
        <input className={field} value={f.from} onChange={(e) => set("from", e.target.value)} />
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
    </>
  );
}
