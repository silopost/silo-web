import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { metaQuery } from "../../api/queries/meta";
import type { SnoozePreset } from "../../api/types";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { t } from "../../lib/i18n";
import { useCompose, type WindowMode } from "../../state/compose";
import { useSession } from "../account";
import { AttachmentList } from "./AttachmentList";
import { Editor } from "./Editor";
import { PresetTimeMenu } from "../snooze/PresetTimeMenu";
import { RecipientInput } from "./RecipientInput";
import { getSession } from "./session";

function Bar({
  tone,
  text,
  actions = [],
}: {
  tone: "warn" | "error";
  text: string;
  actions?: [string, () => void][];
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-sm ${
        tone === "warn" ? "bg-warn-bg text-warn-ink" : "bg-error-bg text-error-ink"
      }`}
    >
      <span className="flex-1">{text}</span>
      {actions.map(([label, run]) => (
        <button key={label} type="button" onClick={run} className="font-medium underline">
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Schedule send times: the server has no presets of its own for sending yet, so the snooze
 * presets "tomorrow" (08:00) and "next_week" (Monday 08:00) are used; no date is computed here.
 */
const sendPresetLabel = (preset: SnoozePreset) => t.sendPresets[preset.key];

/** Esc in the editor closes the window too (ProseMirror marks the key as handled). */
const isEditor = (target: EventTarget) => target instanceof HTMLElement && target.isContentEditable;

const SIZE: Record<WindowMode, string> = {
  normal: "h-[min(36rem,85vh)] w-[min(34rem,95vw)]",
  minimized: "w-64",
  maximized: "fixed inset-x-[8vw] top-[5vh] bottom-[5vh] z-40",
};

/**
 * One compose window (plan 6.3): a non-modal dialog with recipients, subject, editor and
 * attachments. Edits go to the draft's DraftSession, which autosaves them to the server.
 */
export function ComposeWindow({ draftId, mode }: { draftId: string; mode: WindowMode }) {
  const qc = useQueryClient();
  const [session] = useState(() => getSession(qc, draftId));
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const setMode = useCompose((s) => s.setMode);
  const failure = useCompose((s) => s.failures[draftId]);
  const remoteVersion = useCompose((s) => s.remoteVersions[draftId] ?? 0);
  const account = useSession()?.accounts?.find((a) => a.id === state.accountId);
  // maxAttachmentBytes for the check before an upload (DraftSession.addFiles).
  useQuery(metaQuery);
  const invalidIn = (field: "to" | "cc" | "bcc") =>
    state.invalid?.field === field ? state.invalid.address : undefined;
  const [ccOpen, setCcOpen] = useState(false);
  const [bccOpen, setBccOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const { form, loaded } = state;
  const ids = {
    to: `${draftId}-to`,
    cc: `${draftId}-cc`,
    bcc: `${draftId}-bcc`,
    subject: `${draftId}-subject`,
    body: `${draftId}-body`,
  };
  const showCc = ccOpen || form.cc.length > 0;
  const showBcc = bccOpen || form.bcc.length > 0;
  const conflict = state.conflict || remoteVersion > state.version;
  const title = form.subject || t.newMessage;

  // Focus the first empty field once the draft is there (plan 6.7).
  const focused = useRef(false);
  useEffect(() => {
    if (!loaded || focused.current || mode === "minimized") return;
    focused.current = true;
    const f = session.getState().form;
    const target = f.to.length === 0 ? ids.to : !f.subject ? ids.subject : ids.body;
    requestAnimationFrame(() => document.getElementById(target)?.focus());
  }, [loaded, mode, session, ids.to, ids.subject, ids.body]);

  const reveal = (field: "cc" | "bcc") => {
    if (field === "cc") setCcOpen(true);
    else setBccOpen(true);
    requestAnimationFrame(() => document.getElementById(ids[field])?.focus());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.nativeEvent.isComposing) return;
    // Keys of the schedule send menu and dialog (portals) bubble here through React.
    if (!sectionRef.current?.contains(e.target as Node)) return;
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void session.send();
    } else if (e.key === "Escape" && (!e.defaultPrevented || isEditor(e.target))) {
      e.preventDefault();
      void session.close();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "C" || e.key === "c")) {
      e.preventDefault();
      reveal("cc");
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "B" || e.key === "b")) {
      e.preventDefault();
      reveal("bcc");
    }
  };

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const minimized = mode === "minimized";
  const maximized = mode === "maximized";

  return (
    <>
      {maximized && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/40"
          onClick={() => setMode(draftId, "normal")}
        />
      )}
      <section
        ref={sectionRef}
        role="dialog"
        aria-modal="false"
        aria-label={title}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          // Leaving the window saves (plan 3.8 step 1).
          if (!sectionRef.current?.contains(e.relatedTarget as Node | null)) void session.save();
        }}
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!sectionRef.current?.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          setDragging(false);
          if (e.defaultPrevented || !hasFiles(e)) return;
          e.preventDefault();
          session.addFiles(Array.from(e.dataTransfer.files));
        }}
        className={`relative flex flex-col overflow-hidden rounded-t-xl bg-panel shadow-2xl ${
          maximized ? "rounded-xl" : ""
        } ${SIZE[mode]}`}
      >
        <header
          className="flex h-10 shrink-0 cursor-pointer items-center rounded-t-xl bg-surface pl-4"
          onClick={() => setMode(draftId, minimized ? "normal" : "minimized")}
        >
          <h2 className="min-w-0 flex-1 truncate font-medium">{title}</h2>
          <div className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
            <IconButton
              icon="minimize"
              label={minimized ? t.restore : t.minimize}
              className="size-8"
              onClick={() => setMode(draftId, minimized ? "normal" : "minimized")}
            />
            <IconButton
              icon={maximized ? "closeFullscreen" : "openInFull"}
              label={maximized ? t.exitMaximize : t.maximize}
              size={16}
              className="size-8"
              onClick={() => setMode(draftId, maximized ? "normal" : "maximized")}
            />
            <IconButton
              icon="close"
              label={t.saveAndClose}
              className="size-8"
              onClick={() => void session.close()}
            />
          </div>
        </header>
        {!minimized && (
          <>
            <div aria-live="polite">
              {state.error && <Bar tone="error" text={state.error} />}
              {failure && (
                <Bar
                  tone="error"
                  text={[
                    t.sendFailedIn(failure.error ?? t.genericError),
                    failure.failedRecipients?.length
                      ? t.failedRecipients(failure.failedRecipients.join(", "))
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              )}
              {conflict && (
                <Bar
                  tone="warn"
                  text={t.draftConflict}
                  actions={[
                    [t.reload, () => void session.reload()],
                    [t.overwrite, () => void session.overwrite()],
                  ]}
                />
              )}
              {!conflict && state.serverChanged && (
                <Bar
                  tone="warn"
                  text={t.draftServerChanged}
                  actions={[[t.reload, () => void session.reload()]]}
                />
              )}
            </div>
            {!loaded ? (
              !state.error && (
                <p role="status" className="p-4 text-ink-muted">
                  {t.loading}
                </p>
              )
            ) : (
              <>
                {account && (
                  <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                    <span className="text-ink-muted">{t.from}</span>
                    <span>
                      {account.displayName
                        ? `${account.displayName} <${account.email}>`
                        : account.email}
                    </span>
                  </div>
                )}
                <RecipientInput
                  id={ids.to}
                  label={t.toLabel}
                  value={form.to}
                  invalidAddress={invalidIn("to")}
                  onChange={(to) => session.edit(() => ({ to }))}
                >
                  <span className="flex shrink-0 gap-2 text-ink-muted">
                    {!showCc && (
                      <button
                        type="button"
                        aria-label={t.addCcLabel}
                        onClick={() => reveal("cc")}
                        className="hover:underline"
                      >
                        {t.addCc}
                      </button>
                    )}
                    {!showBcc && (
                      <button
                        type="button"
                        aria-label={t.addBccLabel}
                        onClick={() => reveal("bcc")}
                        className="hover:underline"
                      >
                        {t.addBcc}
                      </button>
                    )}
                  </span>
                </RecipientInput>
                {showCc && (
                  <RecipientInput
                    id={ids.cc}
                    label={t.cc}
                    value={form.cc}
                    invalidAddress={invalidIn("cc")}
                    onChange={(cc) => session.edit(() => ({ cc }))}
                  />
                )}
                {showBcc && (
                  <RecipientInput
                    id={ids.bcc}
                    label={t.bcc}
                    value={form.bcc}
                    invalidAddress={invalidIn("bcc")}
                    onChange={(bcc) => session.edit(() => ({ bcc }))}
                  />
                )}
                <input
                  id={ids.subject}
                  aria-label={t.subject}
                  placeholder={t.subject}
                  value={form.subject}
                  onChange={(e) => session.edit(() => ({ subject: e.target.value }))}
                  className="shrink-0 border-b border-line px-3 py-2 outline-none"
                />
                <Editor
                  id={ids.body}
                  content={form.bodyJson ?? form.bodyHtml}
                  loadSeq={state.loadSeq}
                  onChange={(bodyHtml, bodyJson) => session.edit(() => ({ bodyHtml, bodyJson }))}
                  onFiles={(files) => session.addFiles(files)}
                />
                <AttachmentList
                  attachments={form.attachments}
                  uploads={state.uploads}
                  onRemove={(id) => session.removeAttachment(id)}
                  onRemoveUpload={(key) => session.removeUpload(key)}
                />
                <footer className="flex shrink-0 items-center gap-2 px-3 py-2">
                  <div className="flex shrink-0 items-stretch">
                    <button
                      type="button"
                      disabled={state.sending}
                      onClick={() => void session.send()}
                      className="rounded-l-full bg-primary py-2 pr-4 pl-6 font-medium text-white hover:shadow disabled:opacity-60"
                    >
                      {state.sending ? t.sending : t.send}
                    </button>
                    <PresetTimeMenu
                      open={scheduleOpen}
                      onOpenChange={setScheduleOpen}
                      title={t.scheduleSend}
                      labelOf={sendPresetLabel}
                      onPick={(sendAt) => void session.send(sendAt)}
                      side="top"
                    >
                      <button
                        type="button"
                        aria-label={t.sendOptions}
                        title={t.sendOptions}
                        disabled={state.sending}
                        className="flex items-center rounded-r-full border-l border-white/40 bg-primary pr-2 pl-1 text-white hover:shadow disabled:opacity-60"
                      >
                        <Icon name="arrowDropDown" size={20} />
                      </button>
                    </PresetTimeMenu>
                  </div>
                  <IconButton
                    icon="attach"
                    label={t.attachFiles}
                    onClick={() => fileInput.current?.click()}
                  />
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    hidden
                    aria-label={t.attachFiles}
                    onChange={(e) => {
                      session.addFiles(Array.from(e.target.files ?? []));
                      e.target.value = "";
                    }}
                  />
                  <span aria-live="polite" className="flex-1 text-xs text-ink-muted">
                    {state.save === "saving"
                      ? t.saving
                      : state.save === "saved"
                        ? t.saved
                        : state.save === "error"
                          ? t.saveError
                          : ""}
                  </span>
                  <IconButton
                    icon="delete"
                    label={t.discardDraft}
                    onClick={() => void session.discard()}
                  />
                </footer>
              </>
            )}
            {dragging && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-primary bg-panel/90 text-lg text-primary">
                {t.dropFiles}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
