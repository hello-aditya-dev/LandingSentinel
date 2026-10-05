import { describe, it, expect } from "vitest";
import {
  normalizeDestinationUrl,
  diffAttribution,
  sameSite,
  MARKETING_PARAMS,
} from "@/lib/urls/normalize";

describe("URL normalization: hostname and scheme", () => {
  it("lowercases the hostname", () => {
    const a = normalizeDestinationUrl("https://WWW.Example.com/Path");
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.normalizedKey).toBe("www.example.com/Path");
  });

  it("preserves the path case (paths are case-sensitive)", () => {
    const a = normalizeDestinationUrl("https://example.com/Campaign/Landing");
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.normalizedKey).toBe("example.com/Campaign/Landing");
  });

  it("keeps the root path slash", () => {
    const a = normalizeDestinationUrl("https://example.com/");
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.normalizedKey).toBe("example.com/");
  });

  it("collapses a redundant trailing slash but keeps distinct paths distinct", () => {
    const withSlash = normalizeDestinationUrl("https://example.com/offers/");
    const withoutSlash = normalizeDestinationUrl("https://example.com/offers");
    expect(withSlash.ok && withoutSlash.ok).toBe(true);
    if (withSlash.ok && withoutSlash.ok) {
      expect(withSlash.normalizedKey).toBe(withoutSlash.normalizedKey);
    }
    const other = normalizeDestinationUrl("https://example.com/offers/summer");
    expect(other.ok).toBe(true);
    if (other.ok && withSlash.ok) {
      expect(other.normalizedKey).not.toBe(withSlash.normalizedKey);
    }
  });

  it("strips default ports but keeps non-default ports (they are different sites)", () => {
    const https443 = normalizeDestinationUrl("https://example.com:443/x");
    const plain = normalizeDestinationUrl("https://example.com/x");
    expect(https443.ok && plain.ok).toBe(true);
    if (https443.ok && plain.ok) {
      expect(https443.normalizedKey).toBe(plain.normalizedKey);
    }
    const custom = normalizeDestinationUrl("https://example.com:8443/x");
    expect(custom.ok).toBe(true);
    if (custom.ok && plain.ok) {
      expect(custom.normalizedKey).not.toBe(plain.normalizedKey);
    }
  });

  it("drops the fragment (fragments never reach the server)", () => {
    const withHash = normalizeDestinationUrl("https://example.com/page#section");
    const withoutHash = normalizeDestinationUrl("https://example.com/page");
    expect(withHash.ok && withoutHash.ok).toBe(true);
    if (withHash.ok && withoutHash.ok) {
      expect(withHash.normalizedKey).toBe(withoutHash.normalizedKey);
    }
  });

  it("percent-encodes kept query parameters deterministically", () => {
    const a = normalizeDestinationUrl("https://example.com/p?colour=dark green&size=L");
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.normalizedKey).toBe("example.com/p?colour=dark%20green&size=L");
  });
});

describe("URL normalization: marketing parameter removal for grouping", () => {
  it("removes every documented marketing parameter", () => {
    const url = new URL("https://example.com/p?v=1");
    for (const p of MARKETING_PARAMS) url.searchParams.set(p, "x");
    url.searchParams.set("keep", "me");
    const result = normalizeDestinationUrl(url.toString());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalizedKey).toBe("example.com/p?keep=me&v=1");
      expect(result.keptParams).toEqual([
        ["keep", "me"],
        ["v", "1"],
      ]);
    }
  });

  it("groups the same page with different utm_* parameters into one destination", () => {
    const a = normalizeDestinationUrl("https://example.com/lp?utm_source=google&utm_medium=cpc&utm_campaign=sale");
    const b = normalizeDestinationUrl("https://example.com/lp?utm_source=meta&utm_medium=paid_social");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.normalizedKey).toBe(b.normalizedKey);
  });

  it("groups gclid / fbclid / msclkid click IDs into the same destination", () => {
    const a = normalizeDestinationUrl("https://example.com/lp?gclid=EAIa123");
    const b = normalizeDestinationUrl("https://example.com/lp?fbclid=IwAR456");
    const c = normalizeDestinationUrl("https://example.com/lp?msclkid=789xyz");
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (a.ok && b.ok && c.ok) {
      expect(a.normalizedKey).toBe(b.normalizedKey);
      expect(b.normalizedKey).toBe(c.normalizedKey);
    }
  });

  it("preserves non-marketing query parameters (they change the page)", () => {
    const a = normalizeDestinationUrl("https://example.com/lp?utm_source=google&product=shoes");
    const b = normalizeDestinationUrl("https://example.com/lp?product=boots");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.normalizedKey).toBe("example.com/lp?product=shoes");
      expect(b.normalizedKey).toBe("example.com/lp?product=boots");
      expect(a.normalizedKey).not.toBe(b.normalizedKey);
    }
  });

  it("sorts kept parameters so query ordering does not split destinations", () => {
    const a = normalizeDestinationUrl("https://example.com/lp?b=2&a=1&utm_source=google");
    const b = normalizeDestinationUrl("https://example.com/lp?a=1&b=2");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.normalizedKey).toBe(b.normalizedKey);
  });

  it("does NOT merge URLs that differ only in marketing VALUE but also in kept params", () => {
    const a = normalizeDestinationUrl("https://example.com/lp?utm_campaign=a&variant=1");
    const b = normalizeDestinationUrl("https://example.com/lp?utm_campaign=b&variant=2");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.normalizedKey).not.toBe(b.normalizedKey);
  });

  it("does NOT merge different paths or hosts; http/https of the same page group together (redirects resolve the scheme)", () => {
    const cases = [
      "https://example.com/a",
      "https://example.com/b",
      "https://other.example.com/a",
      "http://example.com/a",
    ];
    const keys = cases.map((c) => {
      const r = normalizeDestinationUrl(c);
      expect(r.ok).toBe(true);
      return r.ok ? r.normalizedKey : "";
    });
    // 3 distinct keys: the scheme is deliberately NOT part of the grouping
    // key — an http destination that redirects to https is the same landing
    // page, and the scan records the final URL as evidence.
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).toBe(keys[3]);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[0]).not.toBe(keys[2]);
  });

  it("does NOT merge a page with a kept param against the same page without it", () => {
    const a = normalizeDestinationUrl("https://example.com/lp?lang=de&utm_source=google");
    const b = normalizeDestinationUrl("https://example.com/lp?lang=en&utm_source=google");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.normalizedKey).not.toBe(b.normalizedKey);
  });
});

describe("URL normalization: failures", () => {
  it("rejects non-http(s) protocols", () => {
    expect(normalizeDestinationUrl("ftp://example.com/x").ok).toBe(false);
    expect(normalizeDestinationUrl("javascript:alert(1)").ok).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(normalizeDestinationUrl("not a url").ok).toBe(false);
    expect(normalizeDestinationUrl("").ok).toBe(false);
  });
});

describe("attribution diff (redirect parameter survival)", () => {
  it("detects preserved parameters", () => {
    const diffs = diffAttribution(
      "https://example.com/lp?utm_source=google&gclid=abc",
      "https://example.com/final?utm_source=google&gclid=abc"
    );
    expect(diffs).toContainEqual({ param: "utm_source", status: "preserved", originalValue: "google" });
    expect(diffs).toContainEqual({ param: "gclid", status: "preserved", originalValue: "abc" });
  });

  it("detects removed parameters", () => {
    const diffs = diffAttribution(
      "https://example.com/lp?utm_source=google&utm_campaign=sale",
      "https://example.com/final"
    );
    expect(diffs).toContainEqual({ param: "utm_source", status: "removed", originalValue: "google" });
    expect(diffs).toContainEqual({ param: "utm_campaign", status: "removed", originalValue: "sale" });
  });

  it("detects changed parameter values", () => {
    const diffs = diffAttribution(
      "https://example.com/lp?utm_campaign=sale",
      "https://example.com/final?utm_campaign=summer"
    );
    expect(diffs).toContainEqual({
      param: "utm_campaign",
      status: "changed",
      originalValue: "sale",
      finalValue: "summer",
    });
  });

  it("ignores parameters that are not attribution parameters", () => {
    const diffs = diffAttribution(
      "https://example.com/lp?product=shoes",
      "https://example.com/final"
    );
    expect(diffs).toEqual([]);
  });
});

describe("same-site hostname comparison", () => {
  it("treats www and apex as the same site", () => {
    expect(sameSite("www.example.com", "example.com")).toBe(true);
  });
  it("treats different registered domains as different sites", () => {
    expect(sameSite("example.com", "other.com")).toBe(false);
    expect(sameSite("example.com", "example.evil.com")).toBe(false);
  });
});
