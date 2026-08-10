// apps/web/src/auth/api-client.ts
import { getAccessToken, setAccessToken } from "./token-store";
import type { MeResponse } from "./types";

// Relative — proxied by vite.config.ts's dev-server `server.proxy` entry to
// apps/api. See that file's comment for the reasoning.
const BASE = "/v1";

export interface ApiErrorDetail {
  field: string;
  message: string;
}

interface ApiErrorBody {
  code: string;
  message: string;
  details?: ApiErrorDetail[];
  // Structured payload for errors that carry numbers rather than a field list.
  data?: Record<string, unknown>;
}

/** Thrown by every helper below on a non-2xx response. */
export class ApiError extends Error {
  readonly code: string;
  readonly details?: ApiErrorDetail[];
  readonly data?: Record<string, unknown>;

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.details = body.details;
    this.data = body.data;
  }
}

async function parseErrorBody(res: Response): Promise<ApiErrorBody> {
  try {
    return (await res.json()) as ApiErrorBody;
  } catch {
    return { code: "unknown", message: "Algo deu errado. Tente novamente." };
  }
}

async function toJsonOrThrow<T>(res: Response): Promise<T> {
  if (res.ok) {
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }
  throw new ApiError(await parseErrorBody(res));
}

/**
 * Calls `/v1/auth/refresh` using the httpOnly `refreshToken` cookie (sent
 * automatically because of `credentials: "include"`). Never throws — a
 * failed refresh (no session, expired cookie) just means "no session",
 * which callers treat as `null`, not an error.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    setAccessToken(null);
    return null;
  }
  const data = (await res.json()) as { accessToken: string };
  setAccessToken(data.accessToken);
  return data.accessToken;
}

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await toJsonOrThrow<{ accessToken: string }>(res);
  setAccessToken(data.accessToken);
  return data.accessToken;
}

/** `token` is the invite/waitlist token (US-8.3 style) — only required when
 * the Google identity has no existing account yet; the API rejects new
 * signups without one (§6.1 invite gate). Login for an existing account
 * ignores it. */
export async function loginWithGoogle(
  idToken: string,
  token?: string,
): Promise<string> {
  const res = await fetch(`${BASE}/auth/google`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, token }),
  });
  const data = await toJsonOrThrow<{ accessToken: string }>(res);
  setAccessToken(data.accessToken);
  return data.accessToken;
}

export async function logout(): Promise<void> {
  const token = getAccessToken();
  try {
    await fetch(`${BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } finally {
    // Clear locally even if the request failed — there's nothing more this
    // client can do about a stale session than drop what it's holding.
    setAccessToken(null);
  }
}

/**
 * Authenticated fetch: attaches the in-memory access token and, on a 401,
 * makes exactly one silent `/v1/auth/refresh` attempt before retrying the
 * original request once — per spec. `refreshAccessToken` is called
 * directly rather than through this function, so the retry can't recurse.
 */
async function apiFetch(
  path: string,
  init: RequestInit = {},
  isRetry = false,
): Promise<Response> {
  const token = getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 401 && !isRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return apiFetch(path, init, true);
    }
  }
  return res;
}

export async function apiFetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await apiFetch(path, init);
  return toJsonOrThrow<T>(res);
}

export function fetchMe(): Promise<MeResponse> {
  return apiFetchJson<MeResponse>("/me");
}

/**
 * US-3.15 — triggers a browser download of the user's data export. Not a
 * plain `<a href>` because the endpoint needs the auth header that
 * `apiFetchJson` already knows how to attach (including the one-shot
 * refresh retry on a stale access token).
 */
export async function downloadMyDataExport(): Promise<void> {
  const data = await apiFetchJson<Record<string, unknown>>("/me/export");
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "lurem-exportacao.json";
  anchor.click();
  URL.revokeObjectURL(url);
}
