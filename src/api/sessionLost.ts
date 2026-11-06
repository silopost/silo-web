let handler: () => void = () => {};

/**
 * What to do when the session ends (401 anywhere, SSE session.expired): set by createApp,
 * which drops the session from the cache and opens /login?redirect=<current page>.
 */
export function setSessionLostHandler(fn: () => void): void {
  handler = fn;
}

export function sessionLost(): void {
  handler();
}
