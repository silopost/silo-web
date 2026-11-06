import { t } from "../../lib/i18n";
import { toast } from "../../state/toasts";

/** Saves text as a file through a temporary object URL (no request leaves the browser). */
export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Copies text to the clipboard with a snackbar of the outcome. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(t.security.copied);
  } catch {
    toast(t.security.copyFailed);
  }
}
