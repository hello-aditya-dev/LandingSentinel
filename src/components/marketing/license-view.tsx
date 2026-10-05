"use client";

/**
 * Human-readable licence summary + the full commercial licence text
 * (mirrors LICENSE.md in the source package).
 */

import { useRouter } from "@/store/router";
import { Sheet, MicroLabel, MarginNote } from "@/components/paper/paper";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Scale, Check, X } from "lucide-react";
import { PRODUCT } from "@/config/product";

export function LicenseView() {
  const navigate = useRouter((s) => s.navigate);
  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 sm:px-6">
      <Button variant="ghost" size="sm" onClick={() => navigate({ view: "home" })} className="w-fit gap-2 px-0 text-ink-2">
        <ArrowLeft size={14} aria-hidden="true" /> Back
      </Button>
      <div className="mt-4 flex items-center gap-3">
        <Scale size={22} aria-hidden="true" />
        <h1 className="font-display text-3xl font-bold tracking-tight">Agency licence</h1>
      </div>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-2">
        LandingSentinel is sold as deployable source code under a commercial licence. This page summarises the
        terms; the full text is reproduced below and ships as <span className="font-mono text-[12px]">LICENSE.md</span>.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Sheet label="PERMITTED" title="The purchaser may">
          <ul className="px-4 py-4 sm:px-5">
            {[
              "Use the software commercially",
              "Modify the source code",
              "Rebrand and white-label it",
              "Deploy it privately, on any hosting they choose",
              "Use it across their own client engagements",
              "Provide access as part of their services",
              "Charge clients for services that use the software",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 py-1 text-[13px] leading-relaxed text-ink-2">
                <Check size={14} className="mt-1 shrink-0 text-healthy" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </Sheet>
        <Sheet label="NOT PERMITTED" title="The purchaser may not">
          <ul className="px-4 py-4 sm:px-5">
            {[
              "Redistribute the source code",
              "Sell the raw source code",
              "Sublicense the source as a source-code product",
              "Publicly publish the source code",
              "Put the proprietary source in a public repository",
              "Sell a competing template or source package substantially based on it",
              "Claim authorship or copyright ownership of the original product",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 py-1 text-[13px] leading-relaxed text-ink-2">
                <X size={14} className="mt-1 shrink-0 text-critical" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </Sheet>
      </div>

      <MarginNote className="mt-4">
        Normal contractor and employee access is allowed when needed to operate or modify the purchaser's
        deployment, with the purchaser retaining responsibility. This licence is practical commercial wording and
        is not a substitute for jurisdiction-specific legal review.
      </MarginNote>

      <Sheet label="LICENSE.MD / FULL TEXT" title="LandingSentinel Commercial Licence" className="mt-8">
        <div className="space-y-4 px-4 py-5 text-[13px] leading-relaxed text-ink-2 sm:px-6">
          <p className="font-semibold text-ink">1 · Grant of licence</p>
          <p>
            The software known as LandingSentinel, including its source code, documentation and sample data (the
            “Software”), is licensed, not sold, to the purchaser (the “Licencee”) under the terms of this agreement.
            Copyright and all intellectual-property rights in the original Software remain with the original
            licensor.
          </p>
          <p className="font-semibold text-ink">2 · Commercial use</p>
          <p>
            The Licencee may use the Software commercially, modify it, rebrand it, deploy it privately, and use it
            across their own client engagements, including providing access to clients as part of the Licencee's
            services and charging for those services.
          </p>
          <p className="font-semibold text-ink">3 · Source-code restrictions</p>
          <p>
            The Licencee may not redistribute the source code, sell or sublicense the raw source code as a
            source-code product, publicly publish the source code, place the proprietary source code in a public
            repository, or sell a competing template or source-code package substantially based on the Software.
            The Licencee may not claim authorship or copyright ownership of the original underlying product.
          </p>
          <p className="font-semibold text-ink">4 · Contractors and employees</p>
          <p>
            The Licencee may give contractors and employees access to the source code as needed to operate or
            modify the Licencee's deployment. The Licencee remains responsible for compliance with this licence by
            such persons.
          </p>
          <p className="font-semibold text-ink">5 · No warranty</p>
          <p>
            The Software is provided “as is”, without warranty of any kind, express or implied, including but not
            limited to the warranties of merchantability, fitness for a particular purpose and non-infringement. To
            the maximum extent permitted by applicable law, the licensor disclaims all warranties.
          </p>
          <p className="font-semibold text-ink">6 · Limitation of liability</p>
          <p>
            To the maximum extent permitted by applicable law, the licensor shall not be liable for any indirect,
            incidental, special, consequential or punitive damages, or any loss of profits, revenues, data or use,
            arising out of or in connection with the Software or this licence, even if advised of the possibility of
            such damages. In no event shall the licensor's total liability exceed the amount paid by the Licencee
            for the licence.
          </p>
          <p className="font-semibold text-ink">7 · Third-party components</p>
          <p>
            The Software depends on third-party open-source components that remain subject to their own licences.
            Nothing in this licence limits rights granted by those components' licences.
          </p>
          <p className="font-semibold text-ink">8 · General</p>
          <p>
            This licence is the entire agreement between the parties regarding the Software. This licence is
            practical commercial wording and is not a substitute for jurisdiction-specific legal review. Version{" "}
            {PRODUCT.version} · Founding Release.
          </p>
        </div>
      </Sheet>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => navigate({ view: "demo" })} className="rounded-[2px]">
          Open live demo
        </Button>
        {PRODUCT.checkoutUrl ? (
          <a
            href={PRODUCT.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-[2px] border border-ink bg-ink px-5 py-2.5 text-[14px] font-medium text-paper transition-opacity hover:opacity-90"
          >
            Buy commercial licence — {PRODUCT.price}
          </a>
        ) : (
          <p className="text-[12.5px] text-ink-3">
            Checkout is not configured on this deployment ({`NEXT_PUBLIC_CHECKOUT_URL`}). The product ships with no
            payment provider hard-wired — connect your own purchase link.
          </p>
        )}
      </div>
      <MarginNote className="mt-4">
        <MicroLabel>LICENSE / {PRODUCT.version.toUpperCase()}</MicroLabel>
      </MarginNote>
    </div>
  );
}
