# Security

What LandingSentinel does to stay safe on the network, where its boundaries
are, and what you are expected to add yourself. This document is written to
be read end-to-end before a production deployment.

## Scanner SSRF protection

The scanner makes outbound requests to URLs that came out of imported CSV
files, which is the classic server-side request forgery (SSRF) surface. Every
URL passes a safety check before any request is made — and again at every
redirect hop:

- **Protocol allowlist.** Only `http:` and `https:`. Anything else
  (`file:`, `ftp:`, internal schemes) is rejected before any connection.
- **Embedded credentials rejected.** `https://user:pass@host/` URLs are not
  scanned.
- **Hostname blocklist.** `localhost`, `*.localhost`, `*.local`,
  `*.internal`, `*.home.arpa`, cloud metadata hostnames
  (`metadata.google.internal`, `metadata`, `instance-data`,
  `ip6-localhost`) and single-label hostnames (no dot, not an IP literal —
  treated as internal) are rejected regardless of what they resolve to.
- **DNS resolution with full address classification.** The hostname is
  resolved, and **every** returned address is classified against unsafe IP
  ranges — by parsing the address, not by string matching. If any address
  falls in an unsafe range, the destination is blocked. The ranges cover
  loopback, RFC 1918 private space, CGNAT shared space (100.64.0.0/10),
  link-local (including the cloud metadata address 169.254.169.254), IETF
  protocol assignments, the TEST-NET documentation ranges, benchmarking
  ranges, multicast and reserved space for IPv4; and unspecified, loopback,
  unique-local, link-local, multicast and documentation ranges for IPv6.
  IPv4-mapped IPv6 addresses (`::ffff:0:0/96`) and NAT64 addresses
  (`64:ff9b::/96`) are unwrapped and the inner IPv4 address is classified
  too.
- **Re-validated at every redirect hop.** Redirects are followed manually
  (below), and the next URL goes through the identical static + DNS + IP
  classification before it is requested. A redirect cannot walk the scanner
  into an internal address.
- **Blocked ≠ requested.** A blocked destination produces an info finding
  ("Destination blocked by scanner safety rules") explaining why. The
  scanner never makes the request.

## Redirect policy

The HTTP client never follows redirects automatically (`redirect: "manual"`).
Each hop is read from the `Location` header, resolved relative to the current
URL, re-validated through the full SSRF check, and only then requested.
Limits: at most `SCAN_MAX_REDIRECTS` (default 5) hops, and a URL that repeats
ends the chain as a redirect loop. Both are reported as critical findings
with the full hop chain as evidence.

## Resource limits

- Per-request timeout: `SCAN_TIMEOUT_MS` (default 10 s), enforced with an
  abort signal.
- Response body cap: `SCAN_MAX_BODY_BYTES` (default 2 MB). The stream is
  cancelled at the cap.
- Per scan: at most `SCAN_MAX_TARGETS` (default 25) destinations, run with
  bounded concurrency (`SCAN_CONCURRENCY`, default 5).
- Per import: at most 5,000 rows.

## Known limitation: DNS rebinding (TOCTOU)

The safety check resolves DNS and classifies the addresses, then the fetch
resolves DNS again. A malicious nameserver can answer the second resolution
differently (DNS rebinding), returning an internal address between the check
and the request. This is a time-of-check/time-of-use gap that application-level
validation cannot fully close. For strict deployments — especially where the
host can reach internal networks — enforce egress filtering at the network
layer (allow outbound 80/443 only, block RFC 1918 and link-local at the
firewall or NAT level). Standard hosted platforms that only offer public
egress make this class of attack largely moot.

## Secrets handling

- No secrets are required to run LandingSentinel. The only credential in the
  environment is the database connection string.
- Nothing secret is placed in client JavaScript: `NEXT_PUBLIC_*` variables
  hold display strings (names, colours, links) by design.
- The scanner uses **no third-party API keys** — no scan depends on an
  external scanning service, so there is no key to leak.

## Authentication posture

**V1 ships without built-in authentication — by design.** The product is
deployed privately by an agency for its own team; an auth layer bolted on
generically would be in the way more than it protects. That means:

- **Put your deployment behind your own access protection before it touches
  the public internet.** Any of the usual approaches work: Vercel
  authentication / SSO on the project, a reverse proxy with basic auth
  (Caddy, nginx), Cloudflare Access, or simply running it on an internal
  network.
- **The demo routes are public and isolated.** The marketing site and its
  "Open live demo" run in the demo workspace (scope `demo`), separate from
  your app workspace. Demo-scope requests always use the synthetic fixture
  scanner and never fetch real URLs (unless you enable public scanning —
  below). The demo workspace can be rebuilt at any time
  (`POST /api/demo/reset`) — nothing of value lives in it.
- `npm run doctor` and Settings → System confirm the deployment's state;
  neither exposes secrets.

## Public scanning warning

`PUBLIC_SCANNER_ENABLED` (default **false**) is the only switch that lets the
public demo routes run the **real** scanner against arbitrary URLs. With the
default settings the demo is inert: fixtures only, no network requests.

If you enable it, understand what you are operating: an authenticated-or-not
public endpoint that makes your server request URLs supplied by visitors.
Before enabling it on a public deployment:

1. Put authentication in front of the demo routes (see above).
2. Rate-limit them at your platform or proxy.
3. Keep the SCAN_* defaults so the blast radius per request stays bounded.

For a private deployment used only by your team, leave it off — the app
workspace scanner does not need it.

## Data boundaries

- **No telemetry.** The application makes no analytics or error-reporting
  calls of its own.
- **No phone-home.** Nothing in the product checks in with the original
  author's infrastructure. Outbound requests go exactly where your imported
  campaign URLs point (plus your database).

## XSS posture

User-controlled text — campaign names, URLs, finding titles, evidence values
and snippets — is rendered as **text** throughout the UI. React's escaping
applies everywhere; evidence snippets are never injected as HTML. Imported
CSV content cannot execute in the app's UI. (The one
`dangerouslySetInnerHTML` use in the codebase is the unmodified shadcn/ui
chart component's static CSS string — not user-controlled.)

## CSV injection note for exports

The Money Map's copy-to-clipboard produces tab-separated **text**, not a CSV
file, and pasting it into a spreadsheet is the intended workflow. The same
caution applies as with any CSV export: if a cell begins with `=`, `+`, `-`
or `@`, Excel and some other spreadsheet applications may interpret it as a
formula. LandingSentinel stores and echoes imported values verbatim by
design (evidence fidelity), so it does not neutralise such content. When
pasting or opening exported data in Excel, use Data → From Text/CSV (which
treats everything as text) rather than double-clicking a file, and review
cells that start with those characters before allowing recalculation.
