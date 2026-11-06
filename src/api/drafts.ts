import { queryOptions } from "@tanstack/react-query";
import { api, clientId } from "./client";
import { getCsrfToken } from "./csrf";
import { ApiError, call } from "./errors";
import { keys } from "./keys";
import type { Address, Draft, SendResult, UploadInfo } from "./types";

export const draftQuery = (id: string) =>
  queryOptions({
    queryKey: keys.draft(id),
    queryFn: ({ signal }) => call(api.GET("/drafts/{id}", { params: { path: { id } }, signal })),
    // The compose window owns the draft while it is open; it refetches only on "Wczytaj".
    staleTime: Infinity,
  });

export type DraftMode = "reply" | "replyAll" | "forward";

export const createDraft = (body: {
  accountId?: string;
  replyToMessageId?: string;
  mode?: DraftMode;
}): Promise<Draft> => call(api.POST("/drafts", { body }));

export type DraftFields = {
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  bodyHtml: string;
  bodyJson: unknown;
  attachmentIds: string[];
};

const recipients = (list: Address[]) =>
  list.map((a) => (a.name ? { email: a.email, name: a.name } : { email: a.email }));

/** syncNow: the copy in the server's Drafts folder is written at once (window closed, plan 3.8). */
export const saveDraft = (
  id: string,
  version: number,
  f: DraftFields,
  syncNow = false,
): Promise<Draft> =>
  call(
    api.PUT("/drafts/{id}", {
      params: { path: { id } },
      body: {
        version,
        to: recipients(f.to),
        cc: recipients(f.cc),
        bcc: recipients(f.bcc),
        subject: f.subject,
        bodyHtml: f.bodyHtml,
        bodyJson: f.bodyJson ?? undefined,
        attachmentIds: f.attachmentIds,
        ...(syncNow ? { syncNow: true } : {}),
      },
    }),
  );

export const deleteDraft = (id: string): Promise<unknown> =>
  call(api.DELETE("/drafts/{id}", { params: { path: { id } } }));

/** POST /drafts/{id}/send; sendAt (RFC 3339) schedules the send (plan 3.9 step 3). */
export const sendDraft = (id: string, sendAt?: string): Promise<SendResult> =>
  call(api.POST("/drafts/{id}/send", { params: { path: { id } }, body: sendAt ? { sendAt } : {} }));

export const cancelOutbound = (id: string): Promise<Draft> =>
  call(api.POST("/outbound/{id}/cancel", { params: { path: { id } } }));

export const contactsQuery = (q: string) =>
  queryOptions({
    queryKey: keys.contacts(q),
    queryFn: ({ signal }) =>
      call(api.GET("/contacts/autocomplete", { params: { query: { q } }, signal })),
    staleTime: 60_000,
  });

export const uploadConfig = {
  url: "/api/v1/uploads",
  createXhr: (): XMLHttpRequest => new XMLHttpRequest(),
};

/**
 * POST /uploads through XMLHttpRequest, which reports upload progress (plan 5.6); fetch does not.
 * Sends the same headers as the API client. Rejects with ApiError for an error answer.
 */
export function uploadFile(
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
  opts: { inline?: boolean } = {},
): Promise<UploadInfo> {
  return new Promise((resolve, reject) => {
    const xhr = uploadConfig.createXhr();
    xhr.open("POST", uploadConfig.url);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-Silo-Client", clientId);
    const csrf = getCsrfToken();
    if (csrf) xhr.setRequestHeader("X-Silo-CSRF", csrf);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve(body as UploadInfo);
      } else {
        reject(
          new ApiError(xhr.status, body as ConstructorParameters<typeof ApiError>[1], undefined),
        );
      }
    };
    xhr.onerror = () => reject(new ApiError(0, undefined, undefined));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    // An inline picture (plan 5.6): the field goes before the file, the server reads it first.
    if (opts.inline) form.append("inline", "true");
    form.append("file", file, file.name);
    xhr.send(form);
  });
}

const MAX_PARALLEL_UPLOADS = 3;
let running = 0;
const waiting: (() => void)[] = [];

/** Runs at most three uploads at once (plan 5.6); the rest wait in order. */
export async function queueUpload<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL_UPLOADS) await new Promise<void>((r) => waiting.push(r));
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}
