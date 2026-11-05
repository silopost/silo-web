import { useQuery } from "@tanstack/react-query";
import {
  useEffect,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { contactsQuery } from "../../api/drafts";
import type { Address } from "../../api/types";
import { Icon } from "../../components/Icon";
import { isValidEmail, parseAddresses } from "../../lib/addresses";
import { t } from "../../lib/i18n";

type Props = {
  /** Id of the text input (label `for`, focus shortcuts). */
  id: string;
  label: string;
  value: Address[];
  onChange: (value: Address[]) => void;
  /** Extra controls at the end of the row (the DW / UDW links). */
  children?: ReactNode;
  /** An address the server refused (Problem.address of this field): its chip is red too. */
  invalidAddress?: string;
};

/** Autocomplete waits this long after typing (plan 6.3). */
export const AUTOCOMPLETE_DEBOUNCE_MS = 150;
const MAX_SUGGESTIONS = 8;

const same = (a: Address, b: Address) => a.email.toLowerCase() === b.email.toLowerCase();

/**
 * Recipients as chips (plan 6.3): Enter, comma, semicolon or Tab turn the text into chips,
 * Backspace removes the last one, pasted lists are split, invalid addresses are red. Suggestions
 * from GET /contacts/autocomplete, navigated with the arrow keys.
 */
export function RecipientInput({ id, label, value, onChange, children, invalidAddress }: Props) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), AUTOCOMPLETE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const contacts = useQuery({ ...contactsQuery(q), enabled: q.length > 0 });
  const items = (contacts.data?.contacts ?? [])
    .filter((c) => !value.some((v) => same(v, c)))
    .slice(0, MAX_SUGGESTIONS);
  const showList = open && text.trim().length > 0 && q.length > 0 && items.length > 0;
  const listId = `${id}-list`;
  const activeIndex = Math.min(active, items.length - 1);

  const add = (list: Address[]) => {
    const next = [...value];
    for (const a of list) if (a.email && !next.some((v) => same(v, a))) next.push(a);
    onChange(next);
    setText("");
    setActive(0);
  };
  const commit = (raw: string) => {
    if (raw.trim()) add(parseAddresses(raw));
  };
  const pick = (i: number) => {
    const c = items[i];
    if (c) add([{ name: c.name, email: c.email }]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
        if (!showList) return;
        e.preventDefault();
        setActive((activeIndex + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
        return;
      case "Enter":
        // Ctrl+Enter sends: keep the typed address and let the window handle the key.
        if (e.ctrlKey || e.metaKey) {
          commit(text);
          return;
        }
        if (showList) {
          e.preventDefault();
          pick(activeIndex);
        } else if (text.trim()) {
          e.preventDefault();
          commit(text);
        }
        return;
      case "Tab":
        if (showList && !e.shiftKey) {
          e.preventDefault();
          pick(activeIndex);
        } else commit(text);
        return;
      case ",":
      case ";":
        if (text.trim()) {
          e.preventDefault();
          commit(text);
        }
        return;
      case "Backspace":
        if (!text && value.length > 0) {
          e.preventDefault();
          onChange(value.slice(0, -1));
        }
        return;
      case "Escape":
        if (showList) {
          // Closes the suggestions only, not the compose window.
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        }
        return;
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (!/[,;\n]|@.*\s.*@/.test(pasted)) return;
    e.preventDefault();
    commit(text + pasted);
  };

  return (
    <div className="relative flex min-h-10 items-center gap-1 border-b border-line px-3 py-1">
      <label htmlFor={id} className="mr-1 shrink-0 text-ink-muted">
        {label}
      </label>
      <ul aria-label={t.recipientsOf(label)} className="contents">
        {value.map((a) => {
          const valid = isValidEmail(a.email) && a.email !== invalidAddress;
          return (
            <li
              key={a.email}
              title={a.email}
              className={`flex max-w-full items-center gap-1 rounded-full border py-0.5 pr-0.5 pl-2 text-sm ${
                valid ? "border-line bg-surface" : "border-error-ink bg-error-bg text-error-ink"
              }`}
            >
              <span className="truncate">{a.name || a.email}</span>
              {!valid && <span className="sr-only">{t.invalidRecipient}</span>}
              <button
                type="button"
                tabIndex={-1}
                aria-label={t.removeRecipient(a.email)}
                onClick={() => onChange(value.filter((v) => v !== a))}
                className="flex size-5 items-center justify-center rounded-full hover:bg-hover"
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          );
        })}
      </ul>
      <input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => {
          commit(text);
          setOpen(false);
        }}
        className="min-w-24 flex-1 bg-transparent py-1 outline-none"
      />
      {children}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t.suggestions}
          className="absolute top-full left-10 z-40 w-80 rounded-lg bg-panel py-1 shadow-lg"
        >
          {items.map((c, i) => (
            <li
              key={c.email}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(i);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 ${i === activeIndex ? "bg-hover" : ""}`}
            >
              {c.name && <span className="block">{c.name}</span>}
              <span className="block text-xs text-ink-muted">{c.email}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
