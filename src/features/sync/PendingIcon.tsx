import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { t } from "../../lib/i18n";

const DELAY_MS = 3000;

/**
 * Clock shown when a thread's operation waits for write-back longer than 3 s (plan 5.7); the
 * typical quick write-back shows nothing.
 */
export function PendingIcon({ pending }: { pending: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setShown(true), DELAY_MS);
    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [pending]);
  if (!pending || !shown) return null;
  return (
    <span title={t.pendingSync} className="text-ink-muted">
      <Icon name="schedule" size={16} />
      <span className="sr-only">{t.pendingSync}</span>
    </span>
  );
}
