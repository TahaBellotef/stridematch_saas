import { env } from "../config/env";
import { getFreshAdminToken, clearAdminToken } from "../auth/token-store";

export const API_BASE = env.apiBaseUrl;

export const jsonHeaders: Record<string, string> = {
  "Content-Type": "application/json",
};

export function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

// Thrown when the backend rejects a request with 401 - the Cognito session
// is dead (access token expired AND refresh token expired/revoked, since
// getFreshAdminToken() already tries to proactively refresh before this
// fires). Callers don't need to handle this themselves: apiFetch already
// clears the session and redirects to /auth/login before throwing.
export class SessionExpiredError extends Error {
  constructor() {
    super("Your session has expired. Please sign in again.");
  }
}

let redirectingToLogin = false;

function redirectToLogin(): void {
  if (redirectingToLogin || typeof window === "undefined") return;
  redirectingToLogin = true;
  clearAdminToken();
  if (!window.location.pathname.startsWith("/auth/login")) {
    window.location.href = "/auth/login";
  }
}

/**
 * Authenticated fetch wrapper - attaches a fresh Cognito access token and,
 * on a 401 response, clears the dead session and redirects to login instead
 * of leaving the caller to surface a raw "Unauthorized" error or silently
 * fail. This is the one place token-expiry-mid-session is handled, so
 * individual pages/services don't each need their own 401 logic.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getFreshAdminToken();
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 401) {
    redirectToLogin();
    throw new SessionExpiredError();
  }

  return response;
}

/** apiFetch + JSON parsing + a consistent error on non-2xx responses. */
export async function apiFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
