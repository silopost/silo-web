import { t } from "../lib/i18n";

/**
 * The Silo mark: the envelope icon (public/icons/icon.svg) beside the name set in the brand
 * font (--font-brand). Sized in em, so the caller's font size scales both. The icon is 1.75x
 * the font size, like the Gmail header (M about 1.8x the wordmark size); the text takes the
 * caller's colour. The name is centred on the envelope body (the rectangle below the open
 * flap), not on the whole icon: items-end plus a small bottom margin puts the cap-height
 * centre at the body centre. The icon is decorative: the visible name is the accessible name.
 */
export function Brand({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-end gap-[0.35em] ${className}`}>
      <img src="/icons/icon.svg" alt="" aria-hidden="true" className="h-[1.75em] w-auto shrink-0" />
      <span className="font-brand mb-[0.03em] leading-none font-bold tracking-[-0.02em]">
        {t.appName}
      </span>
    </span>
  );
}
