import DOMPurify from "dompurify";

// Links open outside the frame, without referrer (plan 6.3).
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.hasAttribute("href")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/**
 * Sandbox of the message frame (plan 6.3): same origin only so that the app can size the frame
 * and its relative cid: image URLs (/api/v1/attachments/…) load with the session cookie; never
 * allow-scripts, which together with allow-same-origin would let the frame lift its sandbox.
 */
export const FRAME_SANDBOX = "allow-same-origin allow-popups allow-popups-to-escape-sandbox";

const REMOTE_IMAGE = /<img\b[^>]*\bsrc\s*=\s*["']?\s*https?:/i;

/** Second line of defence after the server's sanitiser and CSP (plan 6.3). */
export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: [
      "script",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "base",
      "meta",
      "link",
    ],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}

export function frameDocument(body: string, showImages: boolean): string {
  const img = showImages ? "'self' data: https: http:" : "'self' data:";
  const csp = `default-src 'none'; script-src 'none'; img-src ${img}; style-src 'unsafe-inline'; font-src data:`;
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    // Always light paper, whatever the theme of the app: senders write their HTML for a white page.
    `<style>:root{color-scheme:light;background:#fff}` +
    `body{margin:0;font:14px/1.5 Arial,sans-serif;color:#1f1f1f;overflow-wrap:anywhere}` +
    `img{max-width:100%;height:auto}pre{white-space:pre-wrap}</style>` +
    `</head><body>${body}</body></html>`
  );
}

export function hasRemoteImages(html: string): boolean {
  return REMOTE_IMAGE.test(html);
}
