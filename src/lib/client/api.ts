"use client";

/**
 * Typed client for the API envelope { ok, data | error }.
 */

export class ApiClientError extends Error {
  code: string;
  details?: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiClientError("SERVER_FAILURE", "The server returned an unreadable response.");
  }
  const envelope = json as { ok: boolean; data?: T; error?: { code: string; message: string; details?: Record<string, unknown> } };
  if (!envelope.ok || envelope.error) {
    throw new ApiClientError(
      envelope.error?.code ?? "SERVER_FAILURE",
      envelope.error?.message ?? "The server could not complete this request.",
      envelope.error?.details
    );
  }
  return envelope.data as T;
}

export function withScope(path: string, scope: "demo" | "app"): string {
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}scope=${scope}`;
}
