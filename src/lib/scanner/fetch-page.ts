/**
 * Page fetcher with manual redirect handling.
 *
 * The HTTP client NEVER follows redirects automatically. Every hop is:
 * read from the Location header → resolved relative to the current URL →
 * re-validated (protocol, credentials, hostname, DNS, IP classification)
 * → only then requested. Redirect loops and the redirect limit are detected.
 */

import { PRODUCT } from "@/config/product";
import { checkUrlWithResolution, isDnsFailure, dnsFailureCode } from "./url-safety";
import type { PageFetchResult, PageFetchSuccess, RedirectHopDraft, FetchErrorCode } from "./types";

const HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];

function classifyFetchError(err: unknown): { code: FetchErrorCode; message: string } {
  const cause = (err as { cause?: { code?: string } })?.cause;
  const code = cause?.code ?? (err as { code?: string })?.code;
  const message = err instanceof Error ? err.message : String(err);

  switch (code) {
    case "ENOTFOUND":
    case "ENODATA":
    case "EAI_AGAIN":
      return { code: "DNS_ERROR", message: "The hostname could not be resolved (DNS)." };
    case "ECONNREFUSED":
      return { code: "CONNECTION_FAILURE", message: "The connection was refused." };
    case "ENETUNREACH":
    case "EHOSTUNREACH":
    case "ENETDOWN":
      return { code: "CONNECTION_FAILURE", message: "The network reported the host as unreachable." };
    case "ECONNRESET":
    case "EPIPE":
      return { code: "CONNECTION_FAILURE", message: "The connection was reset during the request." };
    case "UND_ERR_CONNECT_TIMEOUT":
      return { code: "TIMEOUT", message: "The connection could not be established in time." };
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "CERT_HAS_EXPIRED":
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "ERR_TLS_CERT_ALTNAME_INVALID":
    case "CERT_CHAIN_INCOMPLETE":
    case "UNSUPPORTED_PROTOCOL":
      return { code: "TLS_ERROR", message: `The TLS connection failed: ${code}` };
    case "ABORT_ERR":
    case "UND_ERR_ABORTED":
      return { code: "TIMEOUT", message: "The scanner stopped this request after the timeout." };
    default:
      if (err instanceof Error && err.name === "AbortError") {
        return { code: "TIMEOUT", message: "The scanner stopped this request after the timeout." };
      }
      return { code: "SCAN_ERROR", message: `The request failed: ${message}` };
  }
}

async function readBodyWithCap(
  res: Response,
  maxBytes: number
): Promise<{ html: string; bytesInspected: number; truncatedAtCap: boolean }> {
  if (!res.body) {
    const text = await res.text();
    return { html: text, bytesInspected: Buffer.byteLength(text, "utf8"), truncatedAtCap: false };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let html = "";
  let bytes = 0;
  let truncated = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        // Keep only up to the cap, then stop reading and cancel the stream.
        html += decoder.decode(value.slice(0, Math.max(0, maxBytes - (bytes - value.byteLength))), { stream: true });
        truncated = true;
        await reader.cancel().catch(() => undefined);
        break;
      }
      html += decoder.decode(value, { stream: true });
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
  return { html, bytesInspected: Math.min(bytes, maxBytes), truncatedAtCap: truncated };
}

export type FetchOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBodyBytes?: number;
  userAgent?: string;
};

/**
 * Fetch a URL following redirects MANUALLY with per-hop SSRF validation.
 * Returns a structured result; never throws.
 */
export async function fetchPage(url: string, opts: FetchOptions = {}): Promise<PageFetchResult> {
  const timeoutMs = opts.timeoutMs ?? PRODUCT.scanner.timeoutMs;
  const maxRedirects = opts.maxRedirects ?? PRODUCT.scanner.maxRedirects;
  const maxBodyBytes = opts.maxBodyBytes ?? PRODUCT.scanner.maxBodyBytes;
  const userAgent = opts.userAgent ?? PRODUCT.scanner.userAgent;

  const redirects: RedirectHopDraft[] = [];
  const visited = new Set<string>();
  let currentUrl = url;
  let finalUrl: string | null = null;
  let lastStatus: number | null = null;
  const startedAt = Date.now();

  const headers: Record<string, string> = {
    "User-Agent": userAgent,
    Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
  };

  for (let hop = 0; hop <= maxRedirects; hop++) {
    // 1. Validate this hop's URL (protocol, credentials, DNS, IP ranges).
    const verdict = await checkUrlWithResolution(currentUrl);
    if (!verdict.safe) {
      if (isDnsFailure(verdict)) {
        return {
          kind: "error",
          requestedUrl: url,
          finalUrl: currentUrl,
          errorCode: "DNS_ERROR",
          message: "The scanner could not resolve this hostname (DNS).",
          detail: `DNS code: ${dnsFailureCode(verdict)}`,
          responseTimeMs: Date.now() - startedAt,
          redirects,
          httpStatus: lastStatus,
        };
      }
      const codeMap: Record<string, FetchErrorCode> = {
        UNSUPPORTED_PROTOCOL: "SCAN_ERROR",
        EMBEDDED_CREDENTIALS: "SCAN_ERROR",
        BLOCKED_HOSTNAME: "BLOCKED_URL" as FetchErrorCode,
        BLOCKED_IP_RANGE: "BLOCKED_URL" as FetchErrorCode,
        INVALID_URL: "SCAN_ERROR",
      };
      return {
        kind: "error",
        requestedUrl: url,
        finalUrl: currentUrl,
        errorCode: codeMap[verdict.code] ?? "SCAN_ERROR",
        message:
          verdict.code === "BLOCKED_HOSTNAME" || verdict.code === "BLOCKED_IP_RANGE"
            ? "The scanner blocked this destination for safety."
            : verdict.reason,
        detail: verdict.reason,
        responseTimeMs: Date.now() - startedAt,
        redirects,
        httpStatus: lastStatus,
      };
    }

    const normalizedCurrent = verdict.url.toString();
    if (visited.has(normalizedCurrent) && hop > 0) {
      return {
        kind: "error",
        requestedUrl: url,
        finalUrl: currentUrl,
        errorCode: "REDIRECT_LOOP",
        message: "The scanner stopped: this destination redirects in a loop.",
        responseTimeMs: Date.now() - startedAt,
        redirects,
        httpStatus: lastStatus,
      };
    }
    visited.add(normalizedCurrent);

    // 2. Request with a hard timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    const requestStart = Date.now();
    try {
      res = await fetch(normalizedCurrent, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers,
      });
    } catch (err) {
      clearTimeout(timer);
      const classified = classifyFetchError(err);
      return {
        kind: "error",
        requestedUrl: url,
        finalUrl: currentUrl,
        errorCode: classified.code,
        message: classified.message,
        detail: classified.code === "TLS_ERROR" ? classified.message : undefined,
        responseTimeMs: Date.now() - startedAt,
        redirects,
        httpStatus: null,
      };
    }
    clearTimeout(timer);
    lastStatus = res.status;

    // 3. Handle redirects manually.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        return {
          kind: "error",
          requestedUrl: url,
          finalUrl: currentUrl,
          errorCode: "SCAN_ERROR",
          message: `The server returned HTTP ${res.status} without a Location header.`,
          responseTimeMs: Date.now() - startedAt,
          redirects,
          httpStatus: res.status,
        };
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, normalizedCurrent);
      } catch {
        return {
          kind: "error",
          requestedUrl: url,
          finalUrl: currentUrl,
          errorCode: "SCAN_ERROR",
          message: "The redirect target could not be parsed.",
          detail: `Location: ${location.slice(0, 200)}`,
          responseTimeMs: Date.now() - startedAt,
          redirects,
          httpStatus: res.status,
        };
      }
      redirects.push({
        sequence: redirects.length,
        fromUrl: currentUrl,
        toUrl: nextUrl.toString(),
        statusCode: res.status,
        durationMs: Date.now() - requestStart,
      });
      // Consume/cancel the 3xx body so the connection is released.
      await res.body?.cancel().catch(() => undefined);
      currentUrl = nextUrl.toString();
      continue;
    }

    // 4. Non-redirect response: inspect content type, then read with a cap.
    // (A chain of exactly maxRedirects redirects that ends in a normal
    // response is a SUCCESS: the loop below allows maxRedirects+1 requests,
    // so hop === maxRedirects here means the final hop was reachable.)
    finalUrl = normalizedCurrent;
    const contentType = res.headers.get("content-type");
    const responseHeaders: Record<string, string> = {};
    for (const key of ["content-type", "server", "cache-control", "x-robots-tag", "location"]) {
      const value = res.headers.get(key);
      if (value) responseHeaders[key] = value.slice(0, 300);
    }

    if (contentType && !HTML_CONTENT_TYPES.some((t) => contentType.toLowerCase().startsWith(t))) {
      await res.body?.cancel().catch(() => undefined);
      const success: PageFetchSuccess = {
        kind: "ok",
        requestedUrl: url,
        finalUrl,
        httpStatus: res.status,
        responseTimeMs: Date.now() - startedAt,
        contentType,
        headers: responseHeaders,
        html: "",
        bytesInspected: 0,
        truncatedAtCap: false,
        redirects,
      };
      return success;
    }

    const body = await readBodyWithCap(res, maxBodyBytes);
    return {
      kind: "ok",
      requestedUrl: url,
      finalUrl,
      httpStatus: res.status,
      responseTimeMs: Date.now() - startedAt,
      contentType,
      headers: responseHeaders,
      html: body.html,
      bytesInspected: body.bytesInspected,
      truncatedAtCap: body.truncatedAtCap,
      redirects,
    };
  }

  // Exceeded the redirect budget.
  return {
    kind: "error",
    requestedUrl: url,
    finalUrl: currentUrl,
    errorCode: "TOO_MANY_REDIRECTS",
    message: `The scanner stopped after ${maxRedirects} redirects.`,
    responseTimeMs: Date.now() - startedAt,
    redirects,
    httpStatus: lastStatus,
  };
}
