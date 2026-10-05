# Branding (white-label)

LandingSentinel is built to be rebranded and resold as your own. Every
identity string the product shows — the product name, your agency identity and
the report masthead — is configurable.

## Quickest rebrand

1. Open **Settings → White-label branding**.
2. Set **Product name** (what the app is called), **Agency name** (who it is
   from) and **Accent colour**.
3. Save. The change applies to the app immediately — no rebuild, no
   redeploy.

That is all most agencies need. Everything else on this page is optional.

## Every branding option

| Option | Where it appears | Notes |
| --- | --- | --- |
| `productName` | App navigation, page titles, report masthead | Defaults to `LandingSentinel`. Max 100 characters. |
| `agencyName` | App header, report masthead ("Prepared by …") | Empty by default. Max 120 characters. |
| `logoUrl` | App header and report masthead | Any image URL. Optional; when unset, a typographic mark is used. Max 500 characters. |
| `accentColor` | Buttons, links, stamps and report accents | Must be a 6-digit hex colour like `#A7372D` (the default). |
| `supportEmail` | Report contact block | Optional. Falls back to the `SUPPORT_EMAIL` environment variable when unset in the database. |
| `website` | Report contact block | Optional agency website URL. |
| `reportFooter` | Bottom of every generated report | Optional free text (e.g. your legal entity line). Max 400 characters. |
| `reportContactName` | Report contact block | Optional named contact (e.g. "A. Sharma, Performance Lead"). Max 120 characters. |

## Where to set them

**In the app UI — Settings → White-label branding.** Values are stored in the
database per workspace and take effect immediately. This is the recommended
path.

The settings view is scope-aware:

- **App scope** (`/app/settings`) edits the branding of the workspace your
  deployment uses — the demo workspace while `DEMO_MODE=true`, otherwise your
  primary workspace.
- **Demo scope** (the public demo's branding playground) edits the demo
  workspace's branding only. This is intentional: the playground lets a
  visitor try the white-label feature without affecting your real identity.

There is no branding difference between workspaces in any other respect; the
same eight options apply.

## Precedence rules

Effective branding is resolved per workspace, field by field:

```
database branding (non-empty value)
  → NEXT_PUBLIC_PRODUCT_NAME / NEXT_PUBLIC_AGENCY_NAME / NEXT_PUBLIC_ACCENT_COLOR env fallbacks
    → built-in defaults
```

Concretely:

- `productName`: database → `NEXT_PUBLIC_PRODUCT_NAME` → `LandingSentinel`
- `agencyName`: database → `NEXT_PUBLIC_AGENCY_NAME` → empty
- `accentColor`: database → `NEXT_PUBLIC_ACCENT_COLOR` → `#A7372D`
- `supportEmail`: database → `SUPPORT_EMAIL` → empty
- `logoUrl`, `website`, `reportFooter`, `reportContactName`: database or
  empty — these have no environment fallback.

The environment variables are fallbacks, not overrides: once you save a
non-empty value in Settings, it wins. The `NEXT_PUBLIC_*` fallbacks are
inlined at build time, so changing them requires a rebuild (see
CONFIGURATION.md).

## Reports snapshot branding at generation time

A generated report stores a copy of the effective branding at the moment it
was generated. Changing your branding afterwards does not rewrite existing
reports — regenerate a report to pick up new branding.

The exception is the synthetic demo report in the public demo playground: it
uses live branding on purpose, so branding edits preview immediately in the
report masthead. Reports generated in a real workspace follow the snapshot
rule described above.
