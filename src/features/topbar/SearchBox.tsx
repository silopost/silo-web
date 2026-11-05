import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Icon } from "../../components/Icon";
import { t } from "../../lib/i18n";
import { useAccountIndex } from "../account";

/** Full-text search without operators (Faza 3) → /u/<n>/search?q=. */
export function SearchBox() {
  const navigate = useNavigate();
  const account = useAccountIndex();
  const current = (useSearch({ strict: false }) as { q?: string }).q ?? "";
  const [q, setQ] = useState(current);
  const [shown, setShown] = useState(current);
  // Follow the URL (e.g. navigation away from a search) without an effect.
  if (current !== shown) {
    setShown(current);
    setQ(current);
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    void navigate({ to: "/u/$account/search", params: { account }, search: { q: query } });
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <form role="search" onSubmit={submit} className="max-w-2xl flex-1">
      <label className="flex h-12 items-center gap-3 rounded-full bg-[#e9eef6] px-4 focus-within:bg-panel focus-within:shadow">
        <Icon name="search" size={22} className="text-ink-muted" />
        <span className="sr-only">{t.search}</span>
        <input
          id="search-input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") e.currentTarget.blur();
          }}
          placeholder={t.search}
          maxLength={500}
          className="h-full flex-1 bg-transparent outline-none"
        />
      </label>
    </form>
  );
}
