type Handler = ((ev: ProgressEvent) => void) | null;

/**
 * Stand-in for the XMLHttpRequest of uploads: msw cannot take jsdom's FormData with a file, so
 * this forwards the request with fetch and reports upload progress. With
 * `paused`, a request stops at 50 % until release().
 */
export class FakeUploadXhr {
  static paused = false;
  private static waiting: (() => void)[] = [];

  static release(): void {
    for (const r of FakeUploadXhr.waiting.splice(0)) r();
  }

  upload: { onprogress: Handler } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  withCredentials = false;
  status = 0;
  responseText = "";
  private method = "GET";
  private url = "";
  private headers = new Headers();
  private aborted = false;

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }

  send(body: FormData): void {
    void this.run(body);
  }

  private progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
  }

  private async run(body: FormData) {
    // Encode the multipart body by hand: neither jsdom's nor Node's FormData survives the trip
    // through msw with a jsdom File (text files are enough for tests).
    const boundary = "----silo-test-boundary";
    let encoded = "";
    let total = 0;
    const crlf = "\r\n";
    for (const [key, value] of body.entries()) {
      encoded += `--${boundary}${crlf}Content-Disposition: form-data; name="${key}"`;
      if (typeof value === "string") {
        encoded += `${crlf}${crlf}${value}${crlf}`;
        continue;
      }
      const text = await value.text();
      total += value.size;
      encoded += `; filename="${value.name}"${crlf}Content-Type: ${value.type}${crlf}${crlf}${text}${crlf}`;
    }
    encoded += `--${boundary}--${crlf}`;
    this.progress(total / 2, total);
    if (FakeUploadXhr.paused) await new Promise<void>((r) => FakeUploadXhr.waiting.push(r));
    if (this.aborted) return;
    try {
      this.headers.set("Content-Type", `multipart/form-data; boundary=${boundary}`);
      const res = await fetch(new URL(this.url, window.location.origin), {
        method: this.method,
        headers: this.headers,
        body: encoded,
      });
      this.status = res.status;
      this.responseText = await res.text();
      if (res.ok) this.progress(total, total);
      this.onload?.();
    } catch {
      this.onerror?.();
    }
  }
}
