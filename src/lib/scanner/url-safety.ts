/**
 * URL safety — SSRF protection for the destination scanner.
 *
 * NON-NEGOTIABLE rules (see SECURITY.md):
 * - Only http: and https: protocols.
 * - Embedded credentials (https://user:pass@host/) are rejected.
 * - Hostnames resolving to loopback, private, link-local, multicast,
 *   unspecified, broadcast, shared (CGNAT), documentation or cloud-metadata
 *   ranges are rejected — by IP classification, not string matching.
 * - The hostname itself is resolved via DNS and EVERY returned address is
 *   validated before any request is made.
 */

import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import type { IPv4, IPv6 } from "ipaddr.js";

export type UrlSafetyVerdict =
  | { safe: true; url: URL; resolvedIps: string[] }
  | { safe: false; code: "INVALID_URL" | "UNSUPPORTED_PROTOCOL" | "EMBEDDED_CREDENTIALS" | "BLOCKED_HOSTNAME" | "BLOCKED_IP_RANGE"; reason: string };

/** Hostnames that are always internal, regardless of resolution. */
const BLOCKED_HOSTNAME_PATTERNS: { pattern: RegExp; reason: string; loopbackOnly?: boolean }[] = [
  { pattern: /^localhost$/i, reason: "localhost is an internal address", loopbackOnly: true },
  { pattern: /\.localhost$/i, reason: "*.localhost is an internal address", loopbackOnly: true },
  { pattern: /\.local$/i, reason: "*.local is an internal hostname" },
  { pattern: /\.internal$/i, reason: "*.internal is an internal hostname" },
  { pattern: /\.home\.arpa$/i, reason: "*.home.arpa is an internal hostname" },
  { pattern: /^metadata\.google\.internal$/i, reason: "cloud metadata endpoint" },
  { pattern: /^instance-data$/i, reason: "cloud metadata endpoint" },
  { pattern: /^metadata$/i, reason: "cloud metadata endpoint" },
  { pattern: /^ip6-localhost$/i, reason: "internal hostname", loopbackOnly: true },
];

/**
 * Network rules. Bases are PARSED at module load: ipaddr.js `match()` only
 * accepts parsed address objects — passing a raw string silently throws
 * ("other.kind is not a function"), which historically disabled the entire
 * range table. Parsing at load time makes a malformed rule fail loudly at
 * startup instead of silently at request time.
 */
type CidrRule = {
  base: string;
  bits: number;
  net: IPv4 | IPv6;
  /** Loopback rules are relaxed ONLY by SCANNER_ALLOW_LOOPBACK_TARGETS. */
  loopbackOnly?: boolean;
};

function buildRules(entries: [string, number, boolean?][], family: "ipv4" | "ipv6"): CidrRule[] {
  // Parse via an arrow wrapper: extracting ipaddr.IPv4.parse directly would
  // detach it from its class receiver (`this`) and crash.
  const parse = (base: string): IPv4 | IPv6 =>
    family === "ipv4" ? ipaddr.IPv4.parse(base) : ipaddr.IPv6.parse(base);
  const rules: CidrRule[] = [];
  for (const [base, bits, loopbackOnly] of entries) {
    const net = parse(base);
    if (net.kind() !== family) {
      throw new Error(`url-safety rule ${base}/${bits} is not an ${family} network`);
    }
    rules.push({ base, bits, net, loopbackOnly });
  }
  return rules;
}

/** IPv4 networks that must never be requested. */
const UNSAFE_IPV4_RULES: CidrRule[] = buildRules(
  [
    ["0.0.0.0", 8], // "this network" / unspecified
    ["10.0.0.0", 8], // RFC1918 private
    ["100.64.0.0", 10], // CGNAT shared address space
    ["127.0.0.0", 8, true], // loopback (relaxed only by the test/dev flag)
    ["169.254.0.0", 16], // link-local incl. cloud metadata 169.254.169.254
    ["172.16.0.0", 12], // RFC1918 private
    ["192.0.0.0", 24], // IETF protocol assignments
    ["192.0.2.0", 24], // TEST-NET-1 (documentation)
    ["192.168.0.0", 16], // RFC1918 private
    ["198.18.0.0", 15], // benchmarking
    ["198.51.100.0", 24], // TEST-NET-2
    ["203.0.113.0", 24], // TEST-NET-3
    ["224.0.0.0", 4], // multicast
    ["240.0.0.0", 4], // reserved (incl. broadcast 255.255.255.255)
  ],
  "ipv4"
);

/** IPv6 networks that must never be requested. */
const UNSAFE_IPV6_RULES: CidrRule[] = buildRules(
  [
    ["::", 128], // unspecified
    ["::1", 128, true], // loopback (relaxed only by the test/dev flag)
    ["::ffff:0:0", 96], // IPv4-mapped — inner IPv4 is checked too
    ["64:ff9b::", 96], // NAT64 — inner IPv4 is checked too
    ["fc00::", 7], // unique local
    ["fe80::", 10], // link-local
    ["ff00::", 8], // multicast
    ["2001:db8::", 32], // documentation
  ],
  "ipv6"
);

/**
 * Loopback relaxation — TEST/DEVELOPMENT ONLY (SCANNER_ALLOW_LOOPBACK_TARGETS).
 * Read from the environment at CALL TIME (not cached) so test suites can
 * control it precisely, and so production can never inherit it accidentally
 * from a stale build-time value. It relaxes ONLY the rules flagged
 * `loopbackOnly`; every other rule — private ranges, cloud metadata,
 * link-local, CGNAT — remains enforced when the flag is set.
 */
function loopbackAllowed(): boolean {
  const raw = process.env.SCANNER_ALLOW_LOOPBACK_TARGETS;
  return raw === "true" || raw === "1";
}

function loopbackOnlyEnabled(loopbackOnly: boolean | undefined): boolean {
  return !(loopbackOnly && loopbackAllowed());
}

function ruleEnabled(rule: CidrRule): boolean {
  return loopbackOnlyEnabled(rule.loopbackOnly);
}

function classifyIp(addr: string): { unsafe: boolean; reason?: string } {
  let parsed;
  try {
    parsed = ipaddr.parse(addr);
  } catch {
    return { unsafe: true, reason: `could not parse address "${addr}"` };
  }

  if (parsed.kind() === "ipv4") {
    for (const rule of UNSAFE_IPV4_RULES) {
      if (!ruleEnabled(rule)) continue;
      if (parsed.match(rule.net, rule.bits)) {
        return { unsafe: true, reason: `${addr} is inside ${rule.base}/${rule.bits}` };
      }
    }
    return { unsafe: false };
  }

  // IPv6: check direct ranges, then unwrap IPv4-mapped / NAT64 addresses.
  for (const rule of UNSAFE_IPV6_RULES) {
    if (!ruleEnabled(rule)) continue;
    if (parsed.match(rule.net, rule.bits)) {
      // IPv4-mapped and NAT64 carry an IPv4 payload that we classify too.
      if (rule.base === "::ffff:0:0" || rule.base === "64:ff9b::") {
        try {
          const inner = parsed.toIPv4Address();
          const innerText = inner.toNormalizedString();
          for (const rule4 of UNSAFE_IPV4_RULES) {
            if (!ruleEnabled(rule4)) continue;
            if (inner.match(rule4.net, rule4.bits)) {
              return { unsafe: true, reason: `${addr} maps to ${innerText} inside ${rule4.base}/${rule4.bits}` };
            }
          }
          return { unsafe: false };
        } catch {
          return { unsafe: true, reason: `${addr} is an unmappable mapped address` };
        }
      }
      return { unsafe: true, reason: `${addr} is inside ${rule.base}/${rule.bits}` };
    }
  }
  return { unsafe: false };
}

/** Is the host string an IP literal (v4 or v6, brackets stripped)? */
function isIpLiteral(host: string): boolean {
  return ipaddr.isValid(host);
}

/**
 * Validate a URL for scanner safety WITHOUT resolving DNS.
 * Used for imported URLs before any request is attempted.
 */
export function checkUrlStatic(rawUrl: string): UrlSafetyVerdict {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { safe: false, code: "INVALID_URL", reason: "The URL is not valid." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      safe: false,
      code: "UNSUPPORTED_PROTOCOL",
      reason: `The protocol "${url.protocol.replace(":", "")}" is not allowed. Only http and https destinations can be scanned.`,
    };
  }

  if (url.username !== "" || url.password !== "") {
    return {
      safe: false,
      code: "EMBEDDED_CREDENTIALS",
      reason: "The URL contains embedded credentials. Such destinations are not scanned.",
    };
  }

  const hostNoBrackets = url.hostname.replace(/^\[|\]$/g, "");

  for (const { pattern, reason, loopbackOnly } of BLOCKED_HOSTNAME_PATTERNS) {
    if (!loopbackOnlyEnabled(loopbackOnly)) continue;
    if (pattern.test(url.hostname) || pattern.test(hostNoBrackets)) {
      return { safe: false, code: "BLOCKED_HOSTNAME", reason: `Blocked: ${reason}.` };
    }
  }

  // Single-label hostnames (no dot) are internal in practice. IP literals
  // (including bracketed IPv6 forms) are exempt and classified by range.
  // With the loopback test flag, the literal name "localhost" is exempt too —
  // every OTHER single-label name stays blocked even in test mode.
  const localhostExempt = loopbackAllowed() && hostNoBrackets.toLowerCase() === "localhost";
  if (!hostNoBrackets.includes(".") && !isIpLiteral(hostNoBrackets) && !localhostExempt) {
    return {
      safe: false,
      code: "BLOCKED_HOSTNAME",
      reason: "Blocked: the hostname has no domain and is treated as internal.",
    };
  }

  if (isIpLiteral(hostNoBrackets)) {
    const verdict = classifyIp(hostNoBrackets);
    if (verdict.unsafe) {
      return {
        safe: false,
        code: "BLOCKED_IP_RANGE",
        reason: `Blocked: ${verdict.reason}.`,
      };
    }
    return { safe: true, url, resolvedIps: [hostNoBrackets] };
  }

  return { safe: true, url, resolvedIps: [] };
}

/**
 * Full safety check: static validation + DNS resolution of the hostname,
 * validating EVERY resolved address. This runs before each request,
 * including every redirect hop.
 */
export async function checkUrlWithResolution(rawUrl: string): Promise<UrlSafetyVerdict> {
  const staticCheck = checkUrlStatic(rawUrl);
  if (!staticCheck.safe) return staticCheck;

  const url = staticCheck.url;
  const hostNoBrackets = url.hostname.replace(/^\[|\]$/g, "");

  // IP literal: already classified statically.
  if (isIpLiteral(hostNoBrackets)) return staticCheck;

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostNoBrackets, { all: true, verbatim: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "ENOTFOUND") {
      // surfaced to the caller as a DNS failure finding, not a safety block
      return { safe: false, code: "INVALID_URL", reason: `__DNS__:${code ?? "ENOTFOUND"}` };
    }
    if (code === "EAI_AGAIN") {
      return { safe: false, code: "INVALID_URL", reason: `__DNS__:EAI_AGAIN` };
    }
    return { safe: false, code: "INVALID_URL", reason: `__DNS__:${code ?? "DNS_ERROR"}` };
  }

  if (addresses.length === 0) {
    return { safe: false, code: "INVALID_URL", reason: "__DNS__:ENOTFOUND" };
  }

  for (const { address } of addresses) {
    const verdict = classifyIp(address);
    if (verdict.unsafe) {
      return {
        safe: false,
        code: "BLOCKED_IP_RANGE",
        reason: `Blocked: ${url.hostname} resolves to ${address}, which ${verdict.reason ? `is inside an unsafe range (${verdict.reason})` : "is unsafe"}.`,
      };
    }
  }

  return { safe: true, url, resolvedIps: addresses.map((a) => a.address) };
}

/** Does this verdict represent a DNS resolution failure (vs a block)? */
export function isDnsFailure(verdict: UrlSafetyVerdict): boolean {
  return !verdict.safe && verdict.code === "INVALID_URL" && verdict.reason.startsWith("__DNS__:");
}

export function dnsFailureCode(verdict: UrlSafetyVerdict): string {
  if (!verdict.safe && verdict.code === "INVALID_URL" && typeof verdict.reason === "string") {
    return verdict.reason.replace("__DNS__:", "");
  }
  return "DNS_ERROR";
}
