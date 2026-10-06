import { Suspense } from "react";
import type { Metadata } from "next";
import { BuySuccessView } from "@/components/marketing/buy-success-view";

/**
 * /buy/success — purchase receipt after server-verified payment. This is a
 * transactional page carrying an unguessable purchase reference, so it is
 * deliberately excluded from indexing.
 */
export const metadata: Metadata = {
  title: { absolute: "Purchase — LandingSentinel" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BuySuccessView />
    </Suspense>
  );
}
