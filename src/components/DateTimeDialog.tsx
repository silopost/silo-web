import * as Dialog from "@radix-ui/react-dialog";
import { useState, type FormEvent } from "react";
import { dateTimeLocalToIso, dateTimeLocalValue } from "../lib/format";
import { t } from "../lib/i18n";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The picked time as RFC 3339 (the field's local time converted, nothing computed). */
  onSubmit: (iso: string) => void;
};

/** "Wybierz datę i godzinę" of snooze and schedule send: a native datetime-local field. */
export function DateTimeDialog({ open, onOpenChange, title, onSubmit }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-50 w-[min(24rem,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-panel p-6 shadow-xl"
        >
          {/* Remounted on every open: the minimum is "now" of that moment. */}
          {open && <Form title={title} onCancel={() => onOpenChange(false)} onSubmit={onSubmit} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Form(props: { title: string; onCancel: () => void; onSubmit: (iso: string) => void }) {
  // The browser's own limit: at least a minute from now (the server checks the real limits).
  const [min] = useState(() => dateTimeLocalValue(new Date(Date.now() + 60_000)));
  const [value, setValue] = useState("");
  const iso = dateTimeLocalToIso(value);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (iso) props.onSubmit(iso);
  };
  return (
    <form onSubmit={submit}>
      <Dialog.Title className="text-lg">{props.title}</Dialog.Title>
      <label className="mt-4 flex flex-col gap-1">
        <span className="text-sm text-ink-muted">{t.dateTime}</span>
        <input
          type="datetime-local"
          required
          min={min}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded border border-line px-2 py-1.5"
        />
      </label>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={props.onCancel}
          className="rounded-full px-4 py-2 font-medium text-primary hover:bg-hover"
        >
          {t.cancel}
        </button>
        <button
          type="submit"
          disabled={!iso}
          className="rounded-full bg-primary px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {t.save}
        </button>
      </div>
    </form>
  );
}
