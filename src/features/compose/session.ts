import type { QueryClient } from "@tanstack/react-query";
import {
  cancelOutbound,
  deleteDraft,
  draftQuery,
  queueUpload,
  saveDraft,
  sendDraft,
  uploadFile,
} from "../../api/drafts";
import { isApiError } from "../../api/errors";
import { metaQuery } from "../../api/queries/meta";
import { keys } from "../../api/keys";
import type { Address, Draft, SendResult, UploadInfo } from "../../api/types";
import { t } from "../../lib/i18n";
import { useCompose } from "../../state/compose";
import { toast, useToasts } from "../../state/toasts";

/** Autosave after this much idle time (plan 3.8 step 1). */
export const composeConfig = { autosaveMs: 2000 };

export type Form = {
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  bodyHtml: string;
  bodyJson: unknown;
  attachments: UploadInfo[];
};

export type UploadItem = {
  key: number;
  name: string;
  size: number;
  /** 0..1 */
  progress: number;
  error?: string;
};

export type SessionState = {
  loaded: boolean;
  /** Grows on every (re)load from the server; the editor replaces its content then. */
  loadSeq: number;
  accountId: string;
  /** Version of the last load or save, sent back with PUT. */
  version: number;
  form: Form;
  uploads: UploadItem[];
  save: "idle" | "saving" | "saved" | "error";
  /** 409 draft_version_conflict: another tab or program saved meanwhile. */
  conflict: boolean;
  /** Draft.serverChanged: the copy in the server's Drafts folder changed in another program. */
  serverChanged: boolean;
  sending: boolean;
  /** Message shown in the window (send refused, load failed). */
  error: string | null;
  /** The recipient refused by the server (400/422 with address and field): its chip is red. */
  invalid: { address: string; field: "to" | "cc" | "bcc" } | null;
};

const emptyForm: Form = {
  to: [],
  cc: [],
  bcc: [],
  subject: "",
  bodyHtml: "",
  bodyJson: null,
  attachments: [],
};

const formOf = (d: Draft): Form => ({
  to: d.to ?? [],
  cc: d.cc ?? [],
  bcc: d.bcc ?? [],
  subject: d.subject,
  bodyHtml: d.bodyHtml,
  bodyJson: d.bodyJson ?? null,
  attachments: d.attachments ?? [],
});

let uploadSeq = 0;

/**
 * Editing state of one open draft, kept outside React so that a save started by closing the
 * window finishes after the window is gone. The server owns the draft (plan 2.6): this only
 * sends PUT /drafts/{id} with the version it edited, after 2 s of idle time, on blur and on close.
 */
export class DraftSession {
  private state: SessionState = {
    loaded: false,
    loadSeq: 0,
    accountId: "",
    version: 0,
    form: emptyForm,
    uploads: [],
    save: "idle",
    conflict: false,
    serverChanged: false,
    sending: false,
    error: null,
    invalid: null,
  };
  private listeners = new Set<() => void>();
  private dirty = false;
  private saving: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private uploadAborts = new Map<number, AbortController>();
  /** Created by this window (new message, reply) and never saved: closing drops it. */
  createdHere = false;
  private saved = false;
  /** Draft.syncedVersion of the last load or save: the version in the server's Drafts folder. */
  private syncedVersion = 0;
  /** The draft as saved meanwhile, from the last 409 (Problem.current): "Wczytaj" needs no GET. */
  private conflictCurrent: Draft | null = null;
  closed = false;

  constructor(
    readonly id: string,
    private readonly qc: QueryClient,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getState = () => this.state;

  get isDirty() {
    return this.dirty || this.saving !== null || this.state.uploads.some((u) => !u.error);
  }

  private set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  load(d: Draft) {
    clearTimeout(this.timer);
    this.dirty = false;
    this.conflictCurrent = null;
    this.syncedVersion = d.syncedVersion;
    this.qc.setQueryData(keys.draft(this.id), d);
    // Draft.lastSend: a failed send stays visible in the window after a reload (plan 3.9).
    useCompose
      .getState()
      .setFailure(
        this.id,
        d.lastSend
          ? { error: d.lastSend.error, failedRecipients: d.lastSend.failedRecipients ?? undefined }
          : null,
      );
    this.set({
      loaded: true,
      loadSeq: this.state.loadSeq + 1,
      accountId: d.accountId,
      version: d.version,
      form: formOf(d),
      conflict: false,
      serverChanged: d.serverChanged,
      save: "idle",
      error: null,
      invalid: null,
    });
  }

  async ensureLoaded() {
    if (this.state.loaded) return;
    try {
      const d = await this.qc.fetchQuery(draftQuery(this.id));
      if (!this.state.loaded) this.load(d);
    } catch {
      this.set({ error: t.draftLoadError });
    }
  }

  /** "Wczytaj": the draft as the server has it now; local edits are dropped (no merging). */
  async reload() {
    try {
      // After a 409 the problem carried the current draft; after draft.updated it is fetched.
      const d =
        this.conflictCurrent ??
        (await this.qc.fetchQuery({ ...draftQuery(this.id), staleTime: 0 }));
      this.load(d);
      this.set({ serverChanged: false });
    } catch {
      this.set({ error: t.draftLoadError });
    }
  }

  /** "Nadpisz": save the local content over the server's version. */
  async overwrite() {
    try {
      const version =
        this.conflictCurrent?.version ??
        (await this.qc.fetchQuery({ ...draftQuery(this.id), staleTime: 0 })).version;
      this.conflictCurrent = null;
      this.dirty = true;
      this.set({ version, conflict: false });
      await this.save();
    } catch {
      this.set({ error: t.draftLoadError });
    }
  }

  edit(change: (f: Form) => Partial<Form>) {
    this.dirty = true;
    const form = { ...this.state.form, ...change(this.state.form) };
    const bad = this.state.invalid;
    const stillBad = bad !== null && form[bad.field].some((a) => a.email === bad.address);
    this.set({ form, save: "idle", ...(stillBad ? {} : { invalid: null }) });
    this.schedule();
  }

  private schedule() {
    clearTimeout(this.timer);
    if (this.state.conflict || this.closed) return;
    this.timer = setTimeout(() => void this.save(), composeConfig.autosaveMs);
  }

  /**
   * PUT /drafts/{id} if there are unsaved edits; resolves false when the save failed. syncNow
   * asks the server to write the Drafts folder copy at once (window closed, plan 3.8).
   */
  async save(syncNow = false): Promise<boolean> {
    clearTimeout(this.timer);
    while (this.saving) await this.saving;
    if (this.state.conflict) return false;
    if (!this.dirty) return true;
    this.dirty = false;
    const f = this.state.form;
    this.set({ save: "saving" });
    const run = (async () => {
      try {
        const d = await saveDraft(
          this.id,
          this.state.version,
          {
            to: f.to,
            cc: f.cc,
            bcc: f.bcc,
            subject: f.subject,
            bodyHtml: f.bodyHtml,
            bodyJson: f.bodyJson,
            attachmentIds: f.attachments.map((a) => a.id),
          },
          syncNow,
        );
        this.saved = true;
        this.syncedVersion = d.syncedVersion;
        this.qc.setQueryData(keys.draft(this.id), d);
        this.set({
          version: d.version,
          save: this.dirty ? "idle" : "saved",
          serverChanged: this.state.serverChanged && d.serverChanged,
        });
        void this.qc.invalidateQueries({ queryKey: keys.threadsAll(d.accountId) });
        return true;
      } catch (err) {
        this.dirty = true;
        if (isApiError(err, 409)) {
          this.conflictCurrent = err.problem?.current ?? null;
          this.set({ conflict: true, save: "idle" });
        } else this.set({ save: "error", invalid: invalidOf(err) ?? this.state.invalid });
        return false;
      }
    })();
    this.saving = run;
    const ok = await run;
    this.saving = null;
    if (ok && this.dirty) this.schedule();
    return ok && !this.dirty;
  }

  /** Saves until nothing is left (edits made during a save are saved too). */
  private async flush(syncNow = false): Promise<boolean> {
    for (let i = 0; i < 3 && (this.dirty || this.saving); i++) {
      if (!(await this.save(syncNow))) return false;
    }
    return !this.dirty;
  }

  addFiles(files: Iterable<File>) {
    // GET /meta maxAttachmentBytes: a file over the limit is refused before it is uploaded.
    const max = this.qc.getQueryData(metaQuery.queryKey)?.maxAttachmentBytes;
    for (const file of files) {
      if (max && file.size > max) {
        const item: UploadItem = {
          key: ++uploadSeq,
          name: file.name,
          size: file.size,
          progress: 0,
          error: t.uploadTooLarge(file.name, max),
        };
        this.set({ uploads: [...this.state.uploads, item] });
        continue;
      }
      const key = ++uploadSeq;
      const abort = new AbortController();
      this.uploadAborts.set(key, abort);
      const item: UploadItem = { key, name: file.name, size: file.size, progress: 0 };
      this.set({ uploads: [...this.state.uploads, item], error: null });
      const patch = (p: Partial<UploadItem>) =>
        this.set({ uploads: this.state.uploads.map((u) => (u.key === key ? { ...u, ...p } : u)) });
      queueUpload(() =>
        abort.signal.aborted
          ? Promise.reject(new DOMException("aborted", "AbortError"))
          : uploadFile(file, (progress) => patch({ progress }), abort.signal),
      ).then(
        (info) => {
          this.uploadAborts.delete(key);
          if (this.closed) return;
          this.set({ uploads: this.state.uploads.filter((u) => u.key !== key) });
          this.edit((f) => ({ attachments: [...f.attachments, info] }));
        },
        (err: unknown) => {
          this.uploadAborts.delete(key);
          if (err instanceof DOMException && err.name === "AbortError") return;
          patch({
            error: isApiError(err, 413)
              ? t.uploadTooLarge(file.name, err.problem?.limit ?? max)
              : t.uploadFailed(file.name),
          });
        },
      );
    }
  }

  removeUpload(key: number) {
    this.uploadAborts.get(key)?.abort();
    this.uploadAborts.delete(key);
    this.set({ uploads: this.state.uploads.filter((u) => u.key !== key) });
  }

  removeAttachment(id: string) {
    this.edit((f) => ({ attachments: f.attachments.filter((a) => a.id !== id) }));
  }

  /** Stops the autosave timer and the uploads. */
  dispose() {
    this.closed = true;
    clearTimeout(this.timer);
    for (const a of this.uploadAborts.values()) a.abort();
    this.uploadAborts.clear();
  }

  private stop() {
    this.dispose();
    useCompose.getState().close(this.id);
  }

  /**
   * X or Esc: the last save with syncNow, so that the Drafts folder copy is written at once
   * instead of 30 s later (plan 3.8). A new draft nobody wrote in is deleted at once, as in
   * Gmail: the server drops such drafts only after 24 h and they would sit in Drafts meanwhile.
   */
  async close() {
    this.stop();
    const unsynced = this.saved && this.syncedVersion < this.state.version;
    if (this.dirty || this.saving || unsynced) {
      // An autosave not yet in the Drafts folder is sent again, now with syncNow.
      this.dirty = true;
      const ok = await this.flush(true);
      if (!ok) toast(t.draftNotSaved);
    } else if (this.createdHere && !this.saved) {
      await deleteDraft(this.id).catch(() => undefined);
      this.qc.removeQueries({ queryKey: keys.draft(this.id) });
      void this.qc.invalidateQueries({ queryKey: keys.threadsAll(this.state.accountId) });
    }
    if (this.closed) sessions.delete(this.id);
  }

  /** "Odrzuć": DELETE /drafts/{id}; the server keeps no undo for it. */
  async discard() {
    this.stop();
    this.dirty = false;
    sessions.delete(this.id);
    useToasts.getState().show({ message: t.draftDiscarded });
    try {
      while (this.saving) await this.saving;
      await deleteDraft(this.id);
    } catch {
      toast(t.genericError);
    }
    this.qc.removeQueries({ queryKey: keys.draft(this.id) });
    void this.qc.invalidateQueries({ queryKey: keys.threadsAll(this.state.accountId) });
  }

  /** Send button / Ctrl+Enter: the last PUT, then POST /drafts/{id}/send (plan 3.9). */
  async send() {
    if (this.state.sending) return;
    if (this.state.uploads.some((u) => !u.error)) {
      this.set({ error: t.uploadsPending });
      return;
    }
    this.set({ sending: true, error: null });
    useCompose.getState().setFailure(this.id, null);
    if (!(await this.flush())) {
      this.set({ sending: false, error: this.state.conflict ? null : t.draftNotSaved });
      return;
    }
    let res: SendResult;
    try {
      res = await sendDraft(this.id);
    } catch (err) {
      this.set({
        sending: false,
        error: sendErrorMessage(err),
        invalid: invalidOf(err) ?? this.state.invalid,
      });
      return;
    }
    this.stop();
    sessions.delete(this.id);
    this.qc.removeQueries({ queryKey: keys.draft(this.id) });
    void this.qc.invalidateQueries({ queryKey: keys.threadsAll(this.state.accountId) });
    showSent(this.qc, res, this.state.accountId);
  }
}

/** The refused recipient of invalid_address / validation_failed (Problem.address, field). */
function invalidOf(err: unknown): SessionState["invalid"] {
  if (!isApiError(err)) return null;
  const p = err.problem;
  return p?.address && p.field ? { address: p.address, field: p.field } : null;
}

function sendErrorMessage(err: unknown): string {
  if (!isApiError(err)) return t.genericError;
  switch (err.code) {
    case "no_recipients":
      return t.noRecipients;
    case "invalid_address":
      return err.problem?.address ? t.invalidAddressOf(err.problem.address) : t.invalidAddress;
    case "message_too_large":
      return t.messageTooLarge(err.problem?.limit, err.problem?.size);
    case "send_in_progress":
      return t.sendInProgress;
    default:
      return t.genericError;
  }
}

const sessions = new Map<string, DraftSession>();

export function getSession(qc: QueryClient, id: string): DraftSession {
  let s = sessions.get(id);
  if (!s) {
    s = new DraftSession(id, qc);
    sessions.set(id, s);
  }
  s.closed = false;
  return s;
}

/** Whether any open draft has unsaved edits (beforeunload warning). */
export const hasUnsavedDrafts = () => [...sessions.values()].some((s) => s.isDirty);

/** For tests: stop and forget all sessions (pending autosaves included). */
export function resetSessions() {
  for (const s of sessions.values()) s.dispose();
  sessions.clear();
}

/** "Wiadomość wysłana · Cofnij" until undoUntil (plan 6.5). */
function showSent(qc: QueryClient, res: SendResult, accountId: string) {
  const toasts = useToasts.getState();
  const undo = () => void undoSend(qc, res.outboundId, accountId);
  toasts.setLastUndo(undo);
  toasts.show({
    message: t.messageSent,
    action: { label: t.undo, run: undo },
    hideAt: Date.parse(res.undoUntil),
  });
}

/** "Cofnij": POST /outbound/{id}/cancel; its draft opens again at once. */
export async function undoSend(qc: QueryClient, outboundId: string, accountId: string) {
  const toasts = useToasts.getState();
  toasts.dismiss();
  toasts.setLastUndo(null);
  try {
    const d = await cancelOutbound(outboundId);
    openLoaded(qc, d);
    toast(t.sendUndone);
  } catch (err) {
    toast(isApiError(err, 409) ? t.tooLateToUndo : t.genericError);
  }
  void qc.invalidateQueries({ queryKey: keys.threadsAll(accountId) });
}

/** Opens a window for a draft the caller already has (POST /drafts, cancel). */
export function openLoaded(
  qc: QueryClient,
  d: Draft,
  opts: { created?: boolean; maximized?: boolean } = {},
) {
  const s = getSession(qc, d.id);
  s.load(d);
  if (opts.created) s.createdHere = true;
  useCompose.getState().open(d.id, opts.maximized ? "maximized" : "normal");
}

/** Opens a window for a draft by id (Drafts list, failed send); GET /drafts/{id}. */
export function openDraft(qc: QueryClient, id: string) {
  const s = getSession(qc, id);
  useCompose.getState().open(id);
  void s.ensureLoaded();
}
