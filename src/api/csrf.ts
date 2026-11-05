// In-memory CSRF token, set once the server issues one for the session.
let token: string | null = null;

export function setCsrfToken(value: string | null): void {
  token = value;
}

export function getCsrfToken(): string | null {
  return token;
}
