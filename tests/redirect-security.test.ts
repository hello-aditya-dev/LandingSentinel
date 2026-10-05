import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Deterministic HTTP + DNS layer: no live network in these tests.
vi.mock("node:dns/promises", () => ({
  // lookup(host, { all: true }) resolves to an ARRAY of addresses.
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

import { fetchPage } from "@/lib/scanner/fetch-page";

const PUBLIC = "https://example.com";

type Route = { status: number; location?: string; body?: string; contentType?: string };

/** Build a mocked fetch backed by a route table keyed by URL. */
function mockFetch(routes: Record<string, Route>) {
  const requested: string[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    requested.push(url);
    const route = routes[url];
    if (!route) {
      return new Response("no route", { status: 404, headers: { "content-type": "text/plain" } });
    }
    const headers: Record<string, string> = {
      "content-type": route.contentType ?? "text/html; charset=utf-8",
    };
    if (route.location !== undefined) headers.location = route.location;
    return new Response(route.body ?? "", { status: route.status, headers });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { requested, fetchMock };
}

function healthyPage(title = "Final page") {
  return `<!DOCTYPE html><html><head><title>${title}</title></head><body><h1>${title}</h1><p>${"Content ".repeat(60)}</p><a href="/cart">Shop now</a></body></html>`;
}

beforeEach(() => {
  delete process.env.SCANNER_ALLOW_LOOPBACK_TARGETS;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SCANNER_ALLOW_LOOPBACK_TARGETS;
});

describe("redirect security: safe public redirects", () => {
  it("public URL → safe public redirect → 200 (absolute Location)", async () => {
    const { requested } = mockFetch({
      [`${PUBLIC}/a`]: { status: 302, location: `${PUBLIC}/b` },
      [`${PUBLIC}/b`]: { status: 200, body: healthyPage() },
    });
    const result = await fetchPage(`${PUBLIC}/a`);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.httpStatus).toBe(200);
      expect(result.finalUrl).toBe(`${PUBLIC}/b`);
      expect(result.redirects).toHaveLength(1);
      expect(result.redirects[0].statusCode).toBe(302);
    }
    expect(requested).toEqual([`${PUBLIC}/a`, `${PUBLIC}/b`]);
  });

  it("follows a relative Location resolved against the current URL", async () => {
    const { requested } = mockFetch({
      [`${PUBLIC}/a`]: { status: 302, location: "b" },
      [`${PUBLIC}/b`]: { status: 200, body: healthyPage() },
    });
    const result = await fetchPage(`${PUBLIC}/a`);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.finalUrl).toBe(`${PUBLIC}/b`);
    expect(requested).toEqual([`${PUBLIC}/a`, `${PUBLIC}/b`]);
  });

  it("accepts a chain of exactly maxRedirects redirects ending in 200", async () => {
    // 5 redirects + final 200 must NOT be reported as TOO_MANY_REDIRECTS.
    const routes: Record<string, Route> = {};
    for (let i = 0; i < 5; i++) routes[`${PUBLIC}/r${i}`] = { status: 302, location: `${PUBLIC}/r${i + 1}` };
    routes[`${PUBLIC}/r5`] = { status: 200, body: healthyPage() };
    const { requested } = mockFetch(routes);
    const result = await fetchPage(`${PUBLIC}/r0`);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.httpStatus).toBe(200);
      expect(result.redirects).toHaveLength(5);
    }
    expect(requested).toHaveLength(6);
  });

  it("records each hop with status and duration", async () => {
    mockFetch({
      [`${PUBLIC}/a`]: { status: 301, location: `${PUBLIC}/b` },
      [`${PUBLIC}/b`]: { status: 200, body: healthyPage() },
    });
    const result = await fetchPage(`${PUBLIC}/a`);
    if (result.kind === "ok") {
      expect(result.redirects[0].fromUrl).toBe(`${PUBLIC}/a`);
      expect(result.redirects[0].toUrl).toBe(`${PUBLIC}/b`);
      expect(result.redirects[0].statusCode).toBe(301);
    } else {
      expect.unreachable("expected success");
    }
  });
});

describe("redirect security: unsafe destinations are rejected BEFORE being fetched", () => {
  it("public URL → localhost redirect is blocked and never fetched", async () => {
    const { requested } = mockFetch({
      [`${PUBLIC}/a`]: { status: 302, location: "http://localhost/x" },
    });
    const result = await fetchPage(`${PUBLIC}/a`);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.errorCode).toBe("BLOCKED_URL");
    } else {
      expect.unreachable("expected block");
    }
    // The unsafe hop was validated and rejected — only the FIRST URL was fetched.
    expect(requested).toEqual([`${PUBLIC}/a`]);
  });

  it("public URL → private-IP redirect (10.0.0.5) is blocked and never fetched", async () => {
    const { requested } = mockFetch({
      [`${PUBLIC}/a`]: { status: 302, location: "http://10.0.0.5/admin" },
    });
    const result = await fetchPage(`${PUBLIC}/a`);
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.errorCode).toBe("BLOCKED_URL");
    expect(requested).toEqual([`${PUBLIC}/a`]);
  });

  it("public URL → cloud metadata redirect (169.254.169.254) is blocked and never fetched", async () => {
    const { requested } = mockFetch({
      [`${PUBLIC}/a`]: { status: 302, location: "http://169.254.169.254/latest/meta-data/" },
    });
    const result = await fetchPage(`${PUBLIC}/a`);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.errorCode).toBe("BLOCKED_URL");
      expect(result.detail).toContain("169.254.169.254");
    }
    expect(requested).toEqual([`${PUBLIC}/a`]);
  });

  it("public URL → IPv6 loopback redirect ([::1]) is blocked and never fetched", async () => {
    const { requested } = mockFetch({
      [`${PUBLIC}/a`]: { status: 302, location: "http://[::1]/x" },
    });
    const result = await fetchPage(`${PUBLIC}/a`);
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.errorCode).toBe("BLOCKED_URL");
    expect(requested).toEqual([`${PUBLIC}/a`]);
  });

  it("blocked redirect attempts are blocked even with the loopback test flag enabled", async () => {
    process.env.SCANNER_ALLOW_LOOPBACK_TARGETS = "true";
    const { requested } = mockFetch({
      [`${PUBLIC}/a`]: { status: 302, location: "http://169.254.169.254/latest/meta-data/" },
    });
    const result = await fetchPage(`${PUBLIC}/a`);
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.errorCode).toBe("BLOCKED_URL");
    expect(requested).toEqual([`${PUBLIC}/a`]);
  });

  it("an initial loopback URL is blocked before ANY request when the flag is off", async () => {
    const { requested } = mockFetch({});
    const result = await fetchPage("http://127.0.0.1:4010/healthy");
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.errorCode).toBe("BLOCKED_URL");
    expect(requested).toEqual([]);
  });
});

describe("redirect security: loops and limits", () => {
  it("detects a redirect loop", async () => {
    mockFetch({
      [`${PUBLIC}/loop-a`]: { status: 302, location: `${PUBLIC}/loop-b` },
      [`${PUBLIC}/loop-b`]: { status: 302, location: `${PUBLIC}/loop-a` },
    });
    const result = await fetchPage(`${PUBLIC}/loop-a`);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.errorCode).toBe("REDIRECT_LOOP");
      expect(result.redirects.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("stops after more than the maximum number of redirects", async () => {
    // maxRedirects: 2, but the chain keeps redirecting.
    const routes: Record<string, Route> = {};
    for (let i = 0; i < 6; i++) routes[`${PUBLIC}/c${i}`] = { status: 302, location: `${PUBLIC}/c${i + 1}` };
    mockFetch(routes);
    const result = await fetchPage(`${PUBLIC}/c0`, { maxRedirects: 2 });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.errorCode).toBe("TOO_MANY_REDIRECTS");
      expect(result.redirects.length).toBe(3); // 0,1,2 followed, third would exceed
    }
  });

  it("treats a 3xx without a Location header as an error, not a redirect", async () => {
    mockFetch({
      [`${PUBLIC}/a`]: { status: 302 },
    });
    const result = await fetchPage(`${PUBLIC}/a`);
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.errorCode).toBe("SCAN_ERROR");
  });
});

describe("redirect security: attribution survival through redirects", () => {
  it("preserves UTM + click-id parameters that survive the chain", async () => {
    mockFetch({
      [`${PUBLIC}/lp?utm_source=google&gclid=abc`]: { status: 302, location: `${PUBLIC}/final?utm_source=google&gclid=abc` },
      [`${PUBLIC}/final?utm_source=google&gclid=abc`]: { status: 200, body: healthyPage() },
    });
    const result = await fetchPage(`${PUBLIC}/lp?utm_source=google&gclid=abc`);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.finalUrl).toContain("utm_source=google");
      expect(result.finalUrl).toContain("gclid=abc");
    }
  });

  it("records the parameter-dropping chain in the hop evidence", async () => {
    mockFetch({
      [`${PUBLIC}/lp?utm_source=google&utm_campaign=sale&gclid=abc`]: { status: 302, location: `${PUBLIC}/final` },
      [`${PUBLIC}/final`]: { status: 200, body: healthyPage() },
    });
    const result = await fetchPage(`${PUBLIC}/lp?utm_source=google&utm_campaign=sale&gclid=abc`);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.finalUrl).toBe(`${PUBLIC}/final`);
      expect(result.redirects[0].fromUrl).toContain("utm_source=google");
      expect(result.redirects[0].toUrl).toBe(`${PUBLIC}/final`);
    }
  });
});

describe("redirect security: non-HTML responses", () => {
  it("reports a JSON response without inspecting it as HTML", async () => {
    mockFetch({
      [`${PUBLIC}/api`]: { status: 200, body: "{}", contentType: "application/json" },
    });
    const result = await fetchPage(`${PUBLIC}/api`);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.html).toBe("");
      expect(result.bytesInspected).toBe(0);
    }
  });
});
