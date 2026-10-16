"use client";

// Same-origin /api (Next.js rewrites proxy to Hono). Injects the active
// profile headers for the profile switcher (see members lib in the API).
const PROFILE_KEY = "yoggan:profile";
const UNLOCK_KEY = "yoggan:unlock";

export function getActiveProfile(): string | null {
  try {
    return localStorage.getItem(PROFILE_KEY);
  } catch {
    return null;
  }
}

export function setActiveProfile(memberId: string | null) {
  try {
    if (memberId) localStorage.setItem(PROFILE_KEY, memberId);
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    // ignore (private mode)
  }
}

export function getUnlockToken(): string | null {
  try {
    return localStorage.getItem(UNLOCK_KEY);
  } catch {
    return null;
  }
}

export function setUnlockToken(token: string | null) {
  try {
    if (token) localStorage.setItem(UNLOCK_KEY, token);
    else localStorage.removeItem(UNLOCK_KEY);
  } catch {
    // ignore
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const profile = getActiveProfile();
  if (profile) headers.set("X-Active-Profile", profile);
  const unlock = getUnlockToken();
  if (unlock) headers.set("X-Profile-Unlock", unlock);
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === "string") message = body.error;
    } catch {
      // keep default
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
  postForm: <T,>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
};

export type DisplayMember = {
  id: string;
  kind: "adult" | "minor";
  isAdmin: number;
  name: string;
};
