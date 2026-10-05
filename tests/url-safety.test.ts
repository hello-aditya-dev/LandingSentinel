import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// DNS is mocked so address resolution is deterministic (no live network).
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

import { lookup as mockedLookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import {
  checkUrlStatic,
  checkUrlWithResolution,
  isDnsFailure,
  dnsFailureCode,
} from "@/lib/scanner/url-safety";

const dnsMock = mockedLookup as unknown as ReturnType<
  typeof vi.fn<() => Promise<LookupAddress[]>>
>;

function setResolved(...addresses: string[]) {
  const list: LookupAddress[] = addresses.map((address) => ({
    address,
    family: address.includes(":") ? 6 : 4,
  }));
  dnsMock.mockImplementation(async () => list);
}

beforeEach(() => {
  delete process.env.SCANNER_ALLOW_LOOPBACK_TARGETS;
  dnsMock.mockReset();
  setResolved("93.184.216.34"); // public IPv4 by default
});

afterEach(() => {
  delete process.env.SCANNER_ALLOW_LOOPBACK_TARGETS;
});

describe("SSRF: static validation (no DNS)", () => {
  it("accepts a valid public https URL", () => {
    const v = checkUrlStatic("https://example.com/landing?utm_source=google");
    expect(v.safe).toBe(true);
    if (v.safe) expect(v.url.hostname).toBe("example.com");
  });

  it("accepts a valid public http URL", () => {
    expect(checkUrlStatic("http://example.com/").safe).toBe(true);
  });

  it("rejects localhost by hostname", () => {
    const v = checkUrlStatic("http://localhost/page");
    expect(v.safe).toBe(false);
    if (!v.safe) expect(v.code).toBe("BLOCKED_HOSTNAME");
  });

  it("rejects *.localhost, *.local and *.internal hostnames", () => {
    for (const host of ["app.localhost", "printer.local", "db.internal"]) {
      const v = checkUrlStatic(`http://${host}/`);
      expect(v.safe).toBe(false);
      if (!v.safe) expect(v.code).toBe("BLOCKED_HOSTNAME");
    }
  });

  it("rejects cloud metadata hostnames", () => {
    for (const host of ["metadata.google.internal", "metadata", "instance-data"]) {
      const v = checkUrlStatic(`http://${host}/`);
      expect(v.safe).toBe(false);
    }
  });

  it("rejects single-label hostnames (no domain)", () => {
    const v = checkUrlStatic("http://intranet/");
    expect(v.safe).toBe(false);
    if (!v.safe) expect(v.code).toBe("BLOCKED_HOSTNAME");
  });

  it("rejects 127.0.0.1 and the whole 127.x loopback range", () => {
    for (const ip of ["127.0.0.1", "127.0.0.2", "127.1.2.3", "127.255.255.254"]) {
      const v = checkUrlStatic(`http://${ip}/`);
      expect(v.safe).toBe(false);
      if (!v.safe) expect(v.code).toBe("BLOCKED_IP_RANGE");
    }
  });

  it("rejects 0.0.0.0 (unspecified)", () => {
    const v = checkUrlStatic("http://0.0.0.0/");
    expect(v.safe).toBe(false);
    if (!v.safe) expect(v.code).toBe("BLOCKED_IP_RANGE");
  });

  it("rejects ::1 (IPv6 loopback, bracketed)", () => {
    const v = checkUrlStatic("http://[::1]/");
    expect(v.safe).toBe(false);
    if (!v.safe) expect(v.code).toBe("BLOCKED_IP_RANGE");
  });

  it("rejects RFC1918 private ranges", () => {
    for (const ip of ["10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.254", "192.168.0.1", "192.168.1.254"]) {
      const v = checkUrlStatic(`http://${ip}/`);
      expect(v.safe).toBe(false);
      if (!v.safe) expect(v.code).toBe("BLOCKED_IP_RANGE");
    }
  });

  it("rejects public-looking addresses just outside RFC1918 boundaries", () => {
    // 172.32.x is public (RFC1918 ends at 172.31.255.255); 172.15.x is public.
    expect(checkUrlStatic("http://172.32.0.1/").safe).toBe(true);
    expect(checkUrlStatic("http://172.15.0.1/").safe).toBe(true);
    expect(checkUrlStatic("http://192.169.0.1/").safe).toBe(true);
  });

  it("rejects IPv4 link-local and the cloud metadata address 169.254.169.254", () => {
    for (const ip of ["169.254.0.1", "169.254.169.254", "169.254.255.255"]) {
      const v = checkUrlStatic(`http://${ip}/`);
      expect(v.safe).toBe(false);
      if (!v.safe) expect(v.code).toBe("BLOCKED_IP_RANGE");
    }
  });

  it("rejects IPv6 link-local (fe80::) and unique local (fc00::/fd00::)", () => {
    for (const ip of ["fe80::1", "fe80::abcd:1234:5678:9abc", "fc00::1", "fd12:3456:789a::1"]) {
      const v = checkUrlStatic(`http://[${ip}]/`);
      expect(v.safe).toBe(false);
      if (!v.safe) expect(v.code).toBe("BLOCKED_IP_RANGE");
    }
  });

  it("rejects IPv4-mapped IPv6 addresses carrying unsafe IPv4 payloads", () => {
    for (const ip of ["::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "::ffff:192.168.1.1"]) {
      const v = checkUrlStatic(`http://[${ip}]/`);
      expect(v.safe).toBe(false);
      if (!v.safe) expect(v.code).toBe("BLOCKED_IP_RANGE");
    }
  });

  it("rejects NAT64-mapped IPv6 addresses carrying unsafe IPv4 payloads", () => {
    for (const ip of ["64:ff9b::127.0.0.1", "64:ff9b::a00:1" /* 10.0.0.1 */]) {
      const v = checkUrlStatic(`http://[${ip}]/`);
      expect(v.safe).toBe(false);
      if (!v.safe) expect(v.code).toBe("BLOCKED_IP_RANGE");
    }
  });

  it("rejects multicast, documentation and benchmarking ranges", () => {
    for (const ip of ["224.0.0.1", "255.255.255.255", "192.0.2.1", "198.51.100.7", "203.0.113.9", "198.18.0.5"]) {
      const v = checkUrlStatic(`http://${ip}/`);
      expect(v.safe).toBe(false);
    }
  });

  it("rejects embedded credentials", () => {
    const v = checkUrlStatic("https://user:password@example.com/");
    expect(v.safe).toBe(false);
    if (!v.safe) expect(v.code).toBe("EMBEDDED_CREDENTIALS");
  });

  it("rejects non-http protocols", () => {
    for (const url of ["file:///etc/passwd", "ftp://example.com/", "javascript:alert(1)", "gopher://example.com/"]) {
      const v = checkUrlStatic(url);
      expect(v.safe).toBe(false);
      if (!v.safe) expect(v.code).toBe("UNSUPPORTED_PROTOCOL");
    }
  });

  it("rejects malformed URLs", () => {
    const v = checkUrlStatic("http://exa mple.com/");
    expect(v.safe).toBe(false);
    if (!v.safe) expect(v.code).toBe("INVALID_URL");
  });
});

describe("SSRF: DNS resolution validation", () => {
  it("validates every resolved address — one unsafe address blocks the host", async () => {
    setResolved("93.184.216.34", "10.0.0.1");
    const v = await checkUrlWithResolution("https://multi.example.com/");
    expect(v.safe).toBe(false);
    if (!v.safe) {
      expect(v.code).toBe("BLOCKED_IP_RANGE");
      expect(v.reason).toContain("multi.example.com");
      expect(v.reason).toContain("10.0.0.1");
    }
  });

  it("accepts a hostname resolving only to public addresses", async () => {
    setResolved("93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946");
    const v = await checkUrlWithResolution("https://example.com/");
    expect(v.safe).toBe(true);
    if (v.safe) expect(v.resolvedIps).toHaveLength(2);
  });

  it("blocks a hostname that resolves into an RFC1918 range", async () => {
    setResolved("192.168.5.5");
    const v = await checkUrlWithResolution("https://internal-looking.example.com/");
    expect(v.safe).toBe(false);
  });

  it("blocks a hostname that resolves to the cloud metadata address", async () => {
    setResolved("169.254.169.254");
    const v = await checkUrlWithResolution("https://metadata-looking.example.com/");
    expect(v.safe).toBe(false);
    if (!v.safe) expect(v.code).toBe("BLOCKED_IP_RANGE");
  });

  it("reports DNS resolution failures as DNS errors, not safety blocks", async () => {
    dnsMock.mockRejectedValue(Object.assign(new Error("not found"), { code: "ENOTFOUND" }));
    const v = await checkUrlWithResolution("https://does-not-exist.example.com/");
    expect(v.safe).toBe(false);
    expect(isDnsFailure(v)).toBe(true);
    expect(dnsFailureCode(v)).toBe("ENOTFOUND");
  });

  it("reports transient DNS errors (EAI_AGAIN) as DNS failures", async () => {
    dnsMock.mockRejectedValue(Object.assign(new Error("try again"), { code: "EAI_AGAIN" }));
    const v = await checkUrlWithResolution("https://flaky.example.com/");
    expect(isDnsFailure(v)).toBe(true);
    expect(dnsFailureCode(v)).toBe("EAI_AGAIN");
  });

  it("blocks an encoded loopback representation that resolves to 127.0.0.1", async () => {
    // 0177.0.0.1 is the octal form of 127.0.0.1; it is not an IP literal for
    // the static check, so it reaches DNS — where glibc resolves it to the
    // loopback address and the resolved-IP classification blocks it.
    dnsMock.mockImplementation(async () => [{ address: "127.0.0.1", family: 4 }]);
    const v = await checkUrlWithResolution("http://0177.0.0.1/");
    expect(v.safe).toBe(false);
    if (!v.safe) expect(v.code).toBe("BLOCKED_IP_RANGE");
  });
});

describe("SSRF: SCANNER_ALLOW_LOOPBACK_TARGETS (test/dev escape hatch)", () => {
  it("relaxes ONLY loopback — metadata, private and link-local stay blocked", () => {
    process.env.SCANNER_ALLOW_LOOPBACK_TARGETS = "true";
    expect(checkUrlStatic("http://127.0.0.1:4010/healthy").safe).toBe(true);
    expect(checkUrlStatic("http://localhost:4010/healthy").safe).toBe(true);
    // Everything else stays enforced:
    expect(checkUrlStatic("http://169.254.169.254/latest/meta-data/").safe).toBe(false);
    expect(checkUrlStatic("http://10.0.0.1/").safe).toBe(false);
    expect(checkUrlStatic("http://192.168.1.1/").safe).toBe(false);
    expect(checkUrlStatic("http://[fe80::1]/").safe).toBe(false);
    expect(checkUrlStatic("http://[::ffff:10.0.0.1]/").safe).toBe(false);
    expect(checkUrlStatic("http://printer.local/").safe).toBe(false);
    expect(checkUrlStatic("https://user:pw@example.com/").safe).toBe(false);
    expect(checkUrlStatic("file:///etc/passwd").safe).toBe(false);
  });

  it("blocks loopback again once the flag is cleared", () => {
    process.env.SCANNER_ALLOW_LOOPBACK_TARGETS = "true";
    expect(checkUrlStatic("http://127.0.0.1:4010/healthy").safe).toBe(true);
    delete process.env.SCANNER_ALLOW_LOOPBACK_TARGETS;
    expect(checkUrlStatic("http://127.0.0.1:4010/healthy").safe).toBe(false);
  });

  it("does not treat arbitrary strings as enabling the flag", () => {
    process.env.SCANNER_ALLOW_LOOPBACK_TARGETS = "yes";
    expect(checkUrlStatic("http://127.0.0.1:4010/healthy").safe).toBe(false);
    process.env.SCANNER_ALLOW_LOOPBACK_TARGETS = "0";
    expect(checkUrlStatic("http://127.0.0.1:4010/healthy").safe).toBe(false);
  });
});
