type Listener = (ev: MessageEvent) => void;

/** Stand-in for EventSource: tests push server events with emit(). */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  readyState = 0;
  onopen: ((ev: Event) => unknown) | null = null;
  onerror: ((ev: Event) => unknown) | null = null;
  private listeners = new Map<string, Listener[]>();
  private seq = 0;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.(new Event("open"));
    });
  }

  static latest(): FakeEventSource {
    const es = FakeEventSource.instances[FakeEventSource.instances.length - 1];
    if (!es) throw new Error("no EventSource opened");
    return es;
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.readyState = 2;
  }

  emit(type: string, data: unknown): void {
    const ev = new MessageEvent(type, {
      data: JSON.stringify(data),
      lastEventId: String(++this.seq),
    });
    for (const l of this.listeners.get(type) ?? []) l(ev);
  }
}
