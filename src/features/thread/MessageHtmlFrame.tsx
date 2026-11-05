import { useQuery } from "@tanstack/react-query";
import { FRAME_SANDBOX, frameDocument, hasRemoteImages, sanitize } from "../../lib/messageHtml";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { messageHtmlQuery } from "../../api/queries/messageHtml";
import { t } from "../../lib/i18n";

/** HTML of one message in a sandboxed iframe with automatic height. */
export function MessageHtmlFrame({ messageId, subject }: { messageId: string; subject: string }) {
  const html = useQuery(messageHtmlQuery(messageId));
  const [showImages, setShowImages] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);

  const body = useMemo(() => (html.data === undefined ? "" : sanitize(html.data)), [html.data]);
  const remoteImages = useMemo(() => hasRemoteImages(body), [body]);
  const srcDoc = useMemo(() => frameDocument(body, showImages), [body, showImages]);

  const observer = useRef<ResizeObserver | null>(null);
  const onLoad = useCallback(() => {
    const doc = frame.current?.contentDocument;
    if (!doc?.documentElement) return;
    const measure = () => setHeight(doc.documentElement.scrollHeight);
    measure();
    observer.current?.disconnect();
    if (typeof ResizeObserver !== "undefined") {
      observer.current = new ResizeObserver(measure);
      observer.current.observe(doc.documentElement);
    }
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);

  // While a 503 is retried after Retry-After the query stays pending: one spinner for both.
  if (html.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 py-4 text-ink-muted">
        <span className="size-4 animate-spin rounded-full border-2 border-line border-t-primary" />
        {t.contentLoading}
      </p>
    );
  }
  if (html.isError) {
    return (
      <div role="alert" className="flex items-center gap-3 py-4">
        <span>{t.contentError}</span>
        <button
          type="button"
          className="font-medium text-primary"
          onClick={() => void html.refetch()}
        >
          {t.retry}
        </button>
      </div>
    );
  }
  return (
    <div>
      {remoteImages && !showImages && (
        <p className="mb-2 flex items-center gap-2 text-ink-muted">
          {t.imagesBlocked}
          <button
            type="button"
            className="font-medium text-primary"
            onClick={() => setShowImages(true)}
          >
            {t.showImages}
          </button>
        </p>
      )}
      <iframe
        ref={frame}
        title={`${t.messageBody}: ${subject}`}
        sandbox={FRAME_SANDBOX}
        srcDoc={srcDoc}
        onLoad={onLoad}
        className="block w-full border-0"
        style={{ height: Math.max(height, 40) }}
      />
    </div>
  );
}
