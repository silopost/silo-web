import type { UploadInfo } from "../api/types";

/**
 * Inline pictures of a draft (plan 5.6). The server generates the Content-ID of an inline upload
 * and expects `<img src="cid:…">` in bodyHtml; `GET /drafts/{id}` returns that HTML as saved.
 * The editor cannot show `cid:` URLs, so it shows the upload itself (`GET /attachments/{u_…}
 * ?inline=1`) and keeps the cid in `data-cid`; these helpers convert between the two forms.
 */

export const inlinePreviewUrl = (id: string) =>
  `/api/v1/attachments/${encodeURIComponent(id)}?inline=1`;

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html").body;

/** Editor HTML → bodyHtml for PUT /drafts/{id}: cid: sources, no pictures still uploading. */
export function toServerHtml(html: string): string {
  if (!html.includes("<img")) return html;
  const body = parse(html);
  for (const img of Array.from(body.querySelectorAll("img"))) {
    if (img.hasAttribute("data-upload-key")) {
      img.remove();
      continue;
    }
    const cid = img.getAttribute("data-cid");
    if (cid) {
      img.setAttribute("src", `cid:${cid}`);
      img.removeAttribute("data-cid");
    }
  }
  return body.innerHTML;
}

/** bodyHtml of the server → editor HTML: cid: of known inline uploads become their URL. */
export function toEditorHtml(html: string, attachments: UploadInfo[] | null | undefined): string {
  if (!html.includes("cid:")) return html;
  const byCid = new Map((attachments ?? []).filter((a) => a.cid).map((a) => [a.cid!, a] as const));
  const body = parse(html);
  for (const img of Array.from(body.querySelectorAll('img[src^="cid:"]'))) {
    const cid = img.getAttribute("src")!.slice(4);
    const a = byCid.get(cid);
    if (!a) continue;
    img.setAttribute("src", inlinePreviewUrl(a.id));
    img.setAttribute("data-cid", cid);
  }
  return body.innerHTML;
}

/** Whether the HTML still shows the picture with this cid (editor or server form). */
export const refersToCid = (html: string, cid: string) =>
  html.includes(`data-cid="${cid}"`) || html.includes(`cid:${cid}`);
