"use client";

/**
 * /license — the Agency Commercial Licence page.
 *
 * Mirrors LICENSE.md and LICENSE-SUMMARY.md from the source package: the
 * plain-English summary first (exactly the items buyers see in
 * LICENSE-SUMMARY.md), then the full controlling licence text. The shipped
 * LICENSE.md remains the controlling document.
 */

import { useAppNavigate } from "@/lib/nav";
import { PRODUCT } from "@/config/product";
import { Sheet, MicroLabel, MarginNote, DossierLine } from "@/components/paper/paper";
import { Button } from "@/components/ui/button";
import { ArrowRight, Scale, Check, X } from "lucide-react";

const CAN = [
  "Use it forever",
  "Rebrand it completely",
  "Modify the source",
  "Deploy it privately",
  "Use it across unlimited agency clients",
  "Let your employees use it",
  "Let authorized contractors maintain it",
  "Give clients access to your hosted deployment",
  "Charge clients for services/access",
  "Run multiple agency-controlled environments",
  "Keep private forks/backups",
  "Receive 12 months of 0.x updates",
  "Receive 30 days installation support",
];

const CANNOT = [
  "Resell the raw LandingSentinel source",
  "Give the source to another agency",
  "Publish the source publicly",
  "Sublicense the source package",
  "Sell a source-code/template product substantially derived from LandingSentinel",
  "Claim ownership of the original LandingSentinel code",
];

type Section = { title: string; body: React.ReactNode };

function p(...children: React.ReactNode[]) {
  return <p>{children}</p>;
}

const SECTIONS: Section[] = [
  {
    title: "1 · Parties, product and edition",
    body: (
      <>
        {p(
          "This licence agreement (the “Licence”) is entered into between the seller of record identified on the purchase receipt (the “Licensor”) and the purchasing legal entity identified on the purchase receipt (the “Licensee”)."
        )}
        {p(
          "This Licence governs the software product known as LandingSentinel — a paid-media landing-page preflight tool delivered as deployable source code — together with its documentation, database migrations, sample data and any updates delivered under Section 18 (collectively, the “Licensed Software”)."
        )}
        {p(
          "This Licence is issued under the Founding Agency Commercial Licence edition, licence version agency-commercial-2026-10. “Purchase date” means the date payment is recorded as received on the purchase receipt."
        )}
      </>
    ),
  },
  {
    title: "2 · Licence model",
    body: (
      <>
        {p(
          "The Licensor grants the Licensee a non-exclusive, perpetual, worldwide, commercial licence to use the purchased version of the Licensed Software in accordance with this Licence."
        )}
        {p(
          "The Licensee receives the software, not the ownership of it. This Licence is not a transfer of copyright: the Licensee does not acquire ownership of LandingSentinel’s original source code or its underlying intellectual property (Section 14)."
        )}
        {p(
          "The Licence is non-transferable, except for the permitted business-successor transfer described in Section 17."
        )}
      </>
    ),
  },
  {
    title: "3 · Perpetual rights",
    body: (
      <>
        {p(
          "The Licensee may use the purchased version of the Licensed Software forever. There is no recurring LandingSentinel licence fee merely to keep using it."
        )}
        {p(
          "The Licensed Software does not require an activation server, a Licensor-issued licence key, or any recurring licence validation, and it never “phones home” to the Licensor (see also Section 22). Nothing in the software disables or degrades the Licensee’s deployment for licence-checking reasons."
        )}
      </>
    ),
  },
  {
    title: "4 · Unlimited internal users",
    body: (
      <>
        {p(
          "The Licensee — as a single purchasing legal entity — may allow an unlimited number of its employees, team members and authorized staff to use its licensed deployment."
        )}
        {p("There is no per-seat licensing, no user-count limit and no per-user fee under this Licence.")}
      </>
    ),
  },
  {
    title: "5 · Unlimited client work",
    body: (
      <>
        {p(
          "The Licensee may use the Licensed Software across an unlimited number of client engagements — one client, ten clients or a hundred."
        )}
        {p(
          "There is no per-client charge, no client-tier fee and no revenue share payable to the Licensor on services the Licensee delivers."
        )}
      </>
    ),
  },
  {
    title: "6 · Unlimited agency-controlled deployments",
    body: (
      <>
        {p(
          "The Licensee may operate an unlimited number of deployments of the Licensed Software that it controls, including production, staging, development, regional, private internal environments, and separate client-facing hosted instances controlled by the Licensee."
        )}
        {p(
          "No new licence is required per deployment. The limitation in this Licence is on redistribution of the source code (Sections 15 and 16), not on the number of deployments."
        )}
      </>
    ),
  },
  {
    title: "7 · White-label rights",
    body: (
      <>
        {p(
          "The Licensee may remove or replace the Licensed Software’s product name, logo, visual branding, accent colour, support contact, report branding, domain and product title, so that its deployment is presented entirely under the Licensee’s own brand."
        )}
        {p(
          "No public attribution is required. The Licensee is not required to display any “Powered by LandingSentinel” notice, link, badge or credit in its deployment, its reports or any client-facing interface."
        )}
      </>
    ),
  },
  {
    title: "8 · Modification rights",
    body: (
      <>
        {p(
          "The Licensee may modify the Licensed Software, including its user interface, scanner checks, reports, authentication, database, integrations, business logic, branding and workflow."
        )}
        {p(
          "The Licensee has no obligation to contribute modifications back to the Licensor, and no obligation to document or disclose them."
        )}
        {p(
          "Modifications remain subject to the rest of this Licence, including the redistribution restrictions (Sections 15 and 16) and the Licensor’s ownership of the original code (Section 14)."
        )}
      </>
    ),
  },
  {
    title: "9 · Private forks and source control",
    body: (
      <>
        {p(
          "The Licensee may keep the Licensed Software, and modifications to it, in private GitHub or GitLab repositories, private internal source-control systems, private CI/CD pipelines, private backups, and development forks."
        )}
        {p(
          "“Private” means access-controlled to persons permitted under Sections 10 and 11. Making the source available publicly is not permitted (Section 15)."
        )}
      </>
    ),
  },
  {
    title: "10 · Employee and contractor access",
    body: (
      <>
        {p(
          "The Licensee may give its employees and contractors access to the source code, but only as necessary to maintain, operate, customize and deploy the Licensed Software for the licensed purchaser."
        )}
        {p(
          "Such persons receive no independent commercial licence. They may not take the source code and reuse LandingSentinel independently of the Licensee — for example at another employer, at their own agency, or inside a separate product."
        )}
        {p(
          "The Licensee is responsible for compliance with this Licence by everyone it grants access to, including after their employment or engagement ends."
        )}
      </>
    ),
  },
  {
    title: "11 · Client access",
    body: (
      <>
        {p(
          "The Licensee may give its agency clients access to its deployed application: client logins, the scan dashboard, reports, evidence and any hosted portal the Licensee operates."
        )}
        {p(
          "Clients do not receive the raw source code. Client access is access to the Licensee’s deployment; it is not a licence of the source package."
        )}
      </>
    ),
  },
  {
    title: "12 · Right to charge clients",
    body: (
      <>
        {p(
          "The Licensee may charge clients for access to its hosted deployment and for services delivered using LandingSentinel, including paid-media quality assurance, landing-page preflight services, monitoring services, reports, technical audits, and campaign-management services."
        )}
        {p(
          "This is a core, intended right of the Founding Agency Commercial Licence, stated plainly: the money the Licensee earns from clients using LandingSentinel belongs to the Licensee, and nothing in that revenue is payable to the Licensor (Section 5.2)."
        )}
      </>
    ),
  },
  {
    title: "13 · Custom services exclusion",
    body: (
      <>
        {p(
          "This Licence does not include custom development; custom integrations; deployment consulting beyond the included support in Section 19; or bespoke agency implementation."
        )}
        {p(
          "Such services are available separately, at separately agreed scope and price. Nothing in this Licence obliges either party to enter into them."
        )}
      </>
    ),
  },
  {
    title: "14 · Original intellectual property",
    body: (
      <>
        {p(
          "The original source code, design, documentation and underlying intellectual property of LandingSentinel remain owned by the Licensor."
        )}
        {p(
          "Original additions created by the Licensee — for example, code the Licensee writes that is not substantially derived from the Licensed Software — may remain the Licensee’s to the extent permitted by applicable law. That ownership never grants the Licensee ownership of, or rights in, LandingSentinel’s underlying code."
        )}
        {p(
          "The Licensed Software incorporates third-party open-source components. Those components remain subject to their own licences; nothing in this Licence limits the rights their licences grant."
        )}
      </>
    ),
  },
  {
    title: "15 · Restrictions on redistribution",
    body: (
      <>
        {p("The Licensee may not:")}
        <ul className="ml-4 list-disc space-y-1">
          <li>redistribute the raw source code of the Licensed Software;</li>
          <li>upload the source code to a public repository;</li>
          <li>sell copies of the raw source code;</li>
          <li>give the source package to another agency;</li>
          <li>sublicense the raw source code; or</li>
          <li>publish substantial portions of the source code.</li>
        </ul>
        {p("The Licensee may not sell LandingSentinel itself as a downloadable source-code product.")}
        {p(
          "The Licensee may not sell a template, boilerplate or starter kit substantially derived from the Licensed Software."
        )}
        {p("The Licensee may not claim ownership or authorship of the original LandingSentinel code.")}
      </>
    ),
  },
  {
    title: "16 · Competing source products (narrow restriction)",
    body: (
      <>
        {p(
          "The Licensee may not distribute, sublicense, market or sell a downloadable source-code product, template, starter kit, boilerplate or substantially similar source package substantially derived from the Licensed Software."
        )}
        {p(
          "This restriction is deliberately narrow, and it is about one thing only: the redistribution of source code. It is not a restriction on operating a business."
        )}
        {p(
          "The Licensee is allowed to operate a hosted product, agency service, client portal or managed service based on its licensed deployment — including one that competes with services offered by the Licensor or anyone else — and to charge for it under Section 12."
        )}
      </>
    ),
  },
  {
    title: "17 · Business acquisition and transfer",
    body: (
      <>
        {p(
          "The Licensee may transfer this Licence to a successor as part of a merger, an acquisition of the company, or a sale of substantially all of the licensed entity’s business or assets, provided the successor agrees in writing to be bound by this Licence."
        )}
        {p(
          "Any other transfer of this Licence, or of the source package to a separate legal entity, requires the Licensor’s prior written permission."
        )}
      </>
    ),
  },
  {
    title: "18 · Updates",
    body: (
      <>
        {p(
          "Founding purchasers receive 12 months of LandingSentinel 0.x updates from the purchase date, as they are released."
        )}
        {p(
          "Every version already received remains perpetually licensed; the end of the included update period does not limit Section 3."
        )}
        {p(
          "After the included period, continued updates may be made available separately, for a separate fee if charged."
        )}
        {p(
          "Continued use of the Licensed Software is never dependent on buying updates, and no lifetime-updates promise is made."
        )}
      </>
    ),
  },
  {
    title: "19 · Support",
    body: (
      <>
        {p(
          "The Licensee receives 30 days of reasonable installation support from the purchase date."
        )}
        {p(
          "Included support covers: installation; documented configuration; deployment questions; and verified bugs in delivered functionality."
        )}
        {p(
          "Included support excludes: custom development; new integrations; custom redesign; client consulting; and custom business logic (Section 13)."
        )}
        {p("No specific response time is promised. Support is provided on a reasonable-effort basis.")}
      </>
    ),
  },
  {
    title: "20 · Technical guarantee and refunds",
    body: (
      <>
        {p(
          "The Licensed Software carries a 7-day technical guarantee. If the delivered source materially cannot perform functionality described in the documentation, and the Licensee reports the verified issue within seven days of the purchase date, the Licensor may attempt to correct the defect."
        )}
        {p(
          "If a verified material defect cannot reasonably be corrected, the Licensee may request a refund, subject to applicable mandatory consumer and business law."
        )}
        {p(
          "Because source code cannot meaningfully be returned after delivery, change-of-mind refunds are not offered after source access has been granted, except where required by applicable law."
        )}
      </>
    ),
  },
  {
    title: "21 · Disclaimer and limitation of liability",
    body: (
      <>
        {p(
          "Subject to the technical guarantee in Section 20, the Licensed Software performs as described in its documentation — no more. In particular:"
        )}
        <ul className="ml-4 list-disc space-y-1">
          <li>no guarantee is given that every third-party website can be scanned — sites can block, misroute or rate-limit requests;</li>
          <li>no guarantee is given that every tracking tag can be detected statically — tags can be injected dynamically, delayed or obfuscated;</li>
          <li>no guarantee of advertising performance is given — LandingSentinel checks pages; it does not run campaigns;</li>
          <li>no representation is made that the “associated spend” shown for a finding equals actual financial loss;</li>
          <li>third-party platforms — ad networks, websites, hosts and tag vendors — are outside the Licensor’s control.</li>
        </ul>
        {p(
          "To the maximum extent permitted by applicable law: neither party is liable for indirect or consequential damages, or for loss of profits, revenue or data arising out of or in connection with the Licensed Software or this Licence; and the Licensor’s total aggregate liability is limited to the licence fee actually paid. This cap is a reasonable commercial cap for a one-time source-code licence, not a penalty."
        )}
        {p(
          "Nothing in this Licence excludes or limits liability where doing so is prohibited by applicable mandatory law."
        )}
      </>
    ),
  },
  {
    title: "22 · Privacy and telemetry",
    body: (
      <>
        {p("The source package requires no LandingSentinel licence server.")}
        {p(
          "The Licensed Software does not secretly send buyer or client campaign data back to the Licensor. What the software stores, requests and logs is documented in DATA-HANDLING.md."
        )}
        {p(
          "This is a stated design commitment and a selling point, not a footnote: the Licensee’s deployment belongs to the Licensee."
        )}
      </>
    ),
  },
  {
    title: "23 · Precedence, entire agreement and general terms",
    body: (
      <>
        {p(
          "This Licence is commercial licence drafting and does not substitute for qualified legal counsel. The Licensor does not provide legal advice."
        )}
        {p("If LICENSE-SUMMARY.md and this document conflict, this document controls.")}
        {p(
          "This Licence, together with the purchase receipt, is the entire agreement between the parties regarding the Licensed Software and supersedes prior discussions, marketing pages and correspondence regarding its terms."
        )}
        {p("The Licensor is the seller of record identified on the purchase receipt.")}
        {p(
          "If any provision of this Licence is held unenforceable, the remainder continues in force, and the unenforceable provision applies to the maximum extent it can be enforced. Section headings are for convenience only and do not affect interpretation."
        )}
      </>
    ),
  },
];

export function LicenseView() {
  const navigate = useAppNavigate();
  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 sm:px-6">
      <Button variant="ghost" size="sm" onClick={() => navigate({ view: "home" })} className="w-fit gap-2 px-0 text-ink-2">
        <ArrowRight size={14} className="rotate-180" aria-hidden="true" /> Back
      </Button>
      <div className="mt-4 flex items-center gap-3">
        <Scale size={22} aria-hidden="true" />
        <h1 className="font-display text-3xl font-bold tracking-tight">Agency licence</h1>
      </div>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-2">
        LandingSentinel is sold as deployable source code under the LandingSentinel Agency Commercial
        Licence — Founding Agency edition. This page summarises the terms in plain English and
        reproduces the full licence text; the controlling document ships as{" "}
        <span className="font-mono text-[12px]">LICENSE.md</span> in the source package.
      </p>
      <DossierLine className="mt-3" items={["EDITION / FOUNDING AGENCY COMMERCIAL LICENCE", "VERSION agency-commercial-2026-10"]} />

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Sheet label="YOU CAN" title="The purchaser may">
          <ul className="px-4 py-4 sm:px-5">
            {CAN.map((item) => (
              <li key={item} className="flex items-start gap-2 py-1 text-[13px] leading-relaxed text-ink-2">
                <Check size={14} className="mt-1 shrink-0 text-healthy" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </Sheet>
        <Sheet label="YOU CANNOT" title="The purchaser may not">
          <ul className="px-4 py-4 sm:px-5">
            {CANNOT.map((item) => (
              <li key={item} className="flex items-start gap-2 py-1 text-[13px] leading-relaxed text-ink-2">
                <X size={14} className="mt-1 shrink-0 text-critical" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </Sheet>
      </div>

      <div className="mt-4 grid gap-px border border-hairline bg-hairline sm:grid-cols-3">
        {[
          ["Updates", "12 months of 0.x updates from purchase; received versions stay licensed forever"],
          ["Support", "30 days of reasonable installation support from purchase"],
          ["Guarantee", "7-day technical guarantee on documented functionality"],
        ].map(([k, v]) => (
          <div key={k} className="bg-paper px-4 py-3">
            <MicroLabel>{k.toUpperCase()}</MicroLabel>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{v}</p>
          </div>
        ))}
      </div>

      <MarginNote className="mt-4">
        Normal employee and contractor access is allowed when needed to operate or modify the
        purchaser’s deployment, with the purchaser retaining responsibility. Operating a hosted
        service — even a competing one — is allowed; redistributing the source is not. This licence
        is practical commercial drafting and is not a substitute for jurisdiction-specific legal
        review.
      </MarginNote>

      <div id="full-licence" className="mt-8 scroll-mt-20">
        <Sheet
          label="LICENSE.MD / FULL TEXT"
          title="LandingSentinel Agency Commercial Licence"
          labelAside={<span className="num">SKU landingsentinel-agency-founding</span>}
        >
        <div className="space-y-5 px-4 py-5 text-[13px] leading-relaxed text-ink-2 sm:px-6">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <p className="font-semibold text-ink">{section.title}</p>
              <div className="mt-1 space-y-2">{section.body}</div>
            </section>
          ))}
        </div>
        </Sheet>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => navigate({ view: "demo" })} className="rounded-[2px]">
          Open live demo
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={() => navigate({ view: "buy" })}
          className="gap-2 rounded-[2px]"
        >
          Buy agency licence — {PRODUCT.price} <ArrowRight size={14} aria-hidden="true" />
        </Button>
      </div>
      <MarginNote className="mt-4">
        <MicroLabel>LICENCE / AGENCY-COMMERCIAL-2026-10</MicroLabel>
      </MarginNote>
    </div>
  );
}
