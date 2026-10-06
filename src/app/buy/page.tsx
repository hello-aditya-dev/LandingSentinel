import { Suspense } from "react";
import type { Metadata } from "next";
import { BuyView } from "@/components/marketing/buy-view";

/**
 * /buy — the commercial purchase page (paper-dossier offer, buyer form,
 * PayPal + Razorpay checkout). Public route. The Suspense boundary lets
 * the view read checkout return parameters (?cancelled=…) with
 * useSearchParams without forcing the whole page dynamic.
 */
export const metadata: Metadata = {
  title: { absolute: "Buy the Agency Licence — LandingSentinel" },
  description:
    "The founding LandingSentinel Agency Commercial Licence: complete source, white-label rights, unlimited agency client work — £349 once.",
  alternates: { canonical: "/buy" },
  openGraph: {
    title: { absolute: "Buy LandingSentinel — Founding Agency Licence (£349)" },
    description:
      "Complete source. White-label. Commercial agency use. No recurring LandingSentinel licence fee.",
  },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BuyView />
    </Suspense>
  );
}
