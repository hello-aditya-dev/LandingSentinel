"use client";

/**
 * /buy — the commercial purchase page.
 *
 * Paper-dossier offer, honest value copy, a short buyer form, licence
 * agreement, then provider checkout (PayPal international / Razorpay
 * India). The client never handles money arithmetic beyond display: the
 * server sets the price, creates the provider order and verifies payment.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAppNavigate } from "@/lib/nav";
import { api, ApiClientError } from "@/lib/client/api";
import { Sheet, MicroLabel, MarginNote, DossierLine } from "@/components/paper/paper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SentinelMark } from "@/components/paper/sentinel-mark";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  Landmark,
  Loader2,
  X,
} from "lucide-react";

type CheckoutConfig = {
  providers: {
    paypal: { available: boolean; mode: "sandbox" | "live" | null };
    razorpay: { available: boolean };
  };
  price: {
    gbpMinor: number;
    gbpDisplay: string;
    inrMinor: number | null;
    inrDisplay: string | null;
  };
  productSku: string;
  licenseEdition: string;
};

type CreatedPurchase =
  | {
      provider: "paypal";
      purchaseId: string;
      approveUrl: string;
    }
  | {
      provider: "razorpay";
      purchaseId: string;
      razorpayOrderId: string;
      razorpayKeyId: string;
      amountMinor: number;
      currency: string;
    };

type RazorpayCheckoutResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const RIGHTS = [
  "Complete source code",
  "Unlimited internal users",
  "Unlimited client work",
  "Unlimited agency-controlled deployments",
  "White-label rights",
  "Modify the source",
  "Charge your clients",
  "Private forks",
  "30 days installation support",
  "12 months of 0.x updates",
  "No activation server",
  "No per-seat fee",
  "No per-client fee",
];

const COUNTRIES = [
  "United Kingdom", "India", "United States", "Canada", "Australia", "New Zealand",
  "Ireland", "Germany", "France", "Netherlands", "Belgium", "Spain", "Italy",
  "Portugal", "Switzerland", "Austria", "Sweden", "Norway", "Denmark", "Finland",
  "Poland", "Czechia", "Romania", "Greece", "Turkey", "United Arab Emirates",
  "Saudi Arabia", "Israel", "South Africa", "Nigeria", "Kenya", "Egypt", "Brazil",
  "Mexico", "Argentina", "Chile", "Colombia", "Singapore", "Malaysia", "Indonesia",
  "Philippines", "Thailand", "Vietnam", "Japan", "South Korea", "Hong Kong",
  "Pakistan", "Bangladesh", "Sri Lanka", "Nepal", "Other",
];

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay checkout script failed to load."));
    document.body.appendChild(script);
  });
}

/** "£349" for whole amounts, "£349.50" otherwise — display only. */
function compactGbp(minor: number): string {
  const symbol = "£";
  return minor % 100 === 0
    ? `${symbol}${(minor / 100).toLocaleString("en-GB")}`
    : `${symbol}${(minor / 100).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;
}

export function BuyView() {
  const navigate = useAppNavigate();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["checkout-config"],
    queryFn: () => api<CheckoutConfig>("/api/purchases"),
    staleTime: 60_000,
  });

  const [buyerName, setBuyerName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [country, setCountry] = useState("");
  const [website, setWebsite] = useState("");
  const [licenceAccepted, setLicenceAccepted] = useState(false);
  const [provider, setProvider] = useState<"paypal" | "razorpay">("paypal");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelledDismissed, setCancelledDismissed] = useState(false);

  // The provider's cancel_url returns here with ?cancelled=…; the banner
  // stays until the buyer starts a new attempt.
  const cancelled = Boolean(searchParams.get("cancelled")) && !cancelledDismissed;

  const paypalAvailable = config?.providers.paypal.available ?? false;
  const razorpayAvailable = config?.providers.razorpay.available ?? false;

  // Effective payment method: the selected provider, corrected to an
  // available one when this deployment only configures a single provider.
  const effectiveProvider: "paypal" | "razorpay" =
    provider === "paypal" && !paypalAvailable && razorpayAvailable
      ? "razorpay"
      : provider === "razorpay" && !razorpayAvailable && paypalAvailable
        ? "paypal"
        : provider;

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail.trim());
  const formValid =
    buyerName.trim().length > 0 &&
    businessName.trim().length > 0 &&
    emailValid &&
    country.trim().length > 0 &&
    licenceAccepted &&
    (effectiveProvider === "paypal" ? paypalAvailable : razorpayAvailable);

  const gbpMinor = config?.price.gbpMinor ?? 34_900;
  const inrDisplay = config?.price.inrDisplay ?? null;

  const arithmetic = useMemo(() => {
    const per = (accounts: number) => compactGbp(Math.round(gbpMinor / accounts));
    return [
      { accounts: 10, per: per(10) },
      { accounts: 20, per: per(20) },
    ];
  }, [gbpMinor]);

  async function onSubmit() {
    if (!formValid || submitting) return;
    setSubmitting(true);
    setError(null);
    setCancelledDismissed(true);
    try {
      const created = await api<CreatedPurchase>("/api/purchases", {
        method: "POST",
        body: JSON.stringify({
          provider: effectiveProvider,
          buyerName: buyerName.trim(),
          buyerEmail: buyerEmail.trim(),
          businessName: businessName.trim(),
          country,
          website: website.trim() || undefined,
          licenceAccepted: true,
        }),
      });
      if (created.provider === "paypal") {
        // PayPal hosts the approval page; the server's return/cancel URLs
        // bring the buyer back here afterwards.
        window.location.assign(created.approveUrl);
        return;
      }
      await openRazorpayCheckout(created);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Checkout could not be started. Check your details and try again."
      );
      setSubmitting(false);
    }
  }

  async function openRazorpayCheckout(created: Extract<CreatedPurchase, { provider: "razorpay" }>) {
    try {
      await loadRazorpayScript();
    } catch {
      setError("Razorpay checkout could not be loaded. Check your connection and try again.");
      setSubmitting(false);
      return;
    }
    const razorpay = new window.Razorpay!({
      key: created.razorpayKeyId,
      order_id: created.razorpayOrderId,
      amount: created.amountMinor,
      currency: created.currency,
      name: "LandingSentinel",
      description: "Agency Commercial Licence",
      handler: (response: RazorpayCheckoutResponse) => {
        // The signature is handed to the server for verification — the
        // browser never decides whether the payment is accepted.
        sessionStorage.setItem(`ls_rzp_${created.purchaseId}`, JSON.stringify(response));
        router.push(`/buy/success?purchase=${created.purchaseId}&provider=razorpay`);
      },
      modal: {
        ondismiss: () => {
          setCancelledDismissed(true);
          setSubmitting(false);
        },
      },
    });
    razorpay.open();
  }

  const anyProvider = paypalAvailable || razorpayAvailable;

  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 sm:px-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate({ view: "home" })}
        className="w-fit gap-2 px-0 text-ink-2"
      >
        <ArrowLeft size={14} aria-hidden="true" /> Back
      </Button>

      <div className="mt-4 flex items-center gap-3">
        <SentinelMark size={26} />
        <h1 className="font-display text-3xl font-bold tracking-tight">Buy the source</h1>
      </div>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-2">
        The founding agency licence for LandingSentinel — the complete deployable source, white-label
        rights and commercial agency use, delivered as a package you own the deployment of.
      </p>
      <DossierLine
        className="mt-3"
        items={["OFFER / FOUNDING AGENCY LICENCE", `EDITION ${config?.licenseEdition ?? "agency-commercial-2026-10"}`]}
      />

      {cancelled ? (
        <div
          role="status"
          className="mt-6 flex items-start gap-3 border border-hairline bg-paper-deep px-4 py-3 text-[13.5px] text-ink-2"
        >
          <X size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
          <p>
            <span className="font-semibold text-ink">Payment cancelled.</span> Nothing was charged.
            You can start the purchase again below whenever you are ready.
          </p>
        </div>
      ) : null}

      {/* ---------------- The offer ---------------- */}
      <Sheet
        className="mt-6"
        label="COMMERCIAL OFFER"
        title="Founding Agency Licence"
        labelAside={<span className="num">SKU {config?.productSku ?? "landingsentinel-agency-founding"}</span>}
      >
        <div className="px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="num font-mono text-4xl font-bold tabular-nums text-ink">
                {configLoading ? "…" : compactGbp(gbpMinor)}
              </div>
              <p className="mt-1 text-[13px] text-ink-2">
                once · {inrDisplay && effectiveProvider === "razorpay" ? `${inrDisplay} via Razorpay (India)` : "GBP, one-time payment"}
              </p>
            </div>
            <p className="max-w-sm text-[13.5px] leading-relaxed text-ink-2">
              Complete source. White-label. Commercial agency use.{" "}
              <span className="text-ink">No recurring LandingSentinel licence fee.</span>
            </p>
          </div>

          <ul className="mt-5 grid gap-x-6 border-t border-hairline pt-4 sm:grid-cols-2">
            {RIGHTS.map((right) => (
              <li key={right} className="flex items-start gap-2 py-1 text-[13px] leading-relaxed text-ink-2">
                <Check size={14} className="mt-1 shrink-0 text-healthy" aria-hidden="true" />
                {right}
              </li>
            ))}
          </ul>
          <MarginNote className="mt-4">
            The licence terms — including the 7-day technical guarantee and what the licence does not
            cover — are on the{" "}
            <a href="/license" className="underline decoration-hairline-strong underline-offset-2 hover:decoration-ink">
              licence page
            </a>{" "}
            and ship inside the package.
          </MarginNote>
        </div>
      </Sheet>

      {/* ---------------- Why own it ---------------- */}
      <section className="mt-6">
        <h2 className="font-display text-xl font-bold tracking-tight">Own the deployment</h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-2">
          LandingSentinel is not another per-seat dashboard subscription. Your agency receives the
          source code, runs its own deployment and can use it throughout its client work.
        </p>
      </section>

      {/* ---------------- One licence ---------------- */}
      <Sheet className="mt-4" label="ONE LICENCE. YOUR AGENCY." title="What £349 works out to">
        <div className="grid gap-px bg-hairline sm:grid-cols-2">
          {arithmetic.map(({ accounts, per }) => (
            <div key={accounts} className="bg-paper px-4 py-4 sm:px-5">
              <MicroLabel>USED ACROSS {accounts} ACCOUNTS</MicroLabel>
              <p className="num mt-1 font-mono text-2xl font-bold tabular-nums">{per}</p>
              <p className="mt-1 text-[12.5px] text-ink-3">per account, once</p>
            </div>
          ))}
        </div>
        <p className="px-4 py-3 text-[12.5px] leading-relaxed text-ink-3 sm:px-5">
          Simple arithmetic examples — they illustrate the licence model, not promised savings or
          revenue. The licence fee is paid once; there is no per-account charge.
        </p>
      </Sheet>

      {/* ---------------- Buyer form ---------------- */}
      <Sheet className="mt-6" label="BUYER DETAILS" title="Who is this licence for?">
        <div className="grid gap-4 px-4 py-5 sm:grid-cols-2 sm:px-6">
          <div className="grid gap-1.5">
            <Label htmlFor="buyerName">Name</Label>
            <Input
              id="buyerName"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              maxLength={120}
              autoComplete="name"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="businessName">Business / agency name</Label>
            <Input
              id="businessName"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              maxLength={160}
              autoComplete="organization"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="buyerEmail">Business email</Label>
            <Input
              id="buyerEmail"
              type="email"
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              maxLength={254}
              autoComplete="email"
              aria-invalid={buyerEmail.length > 0 && !emailValid}
              required
            />
            {buyerEmail.length > 0 && !emailValid ? (
              <p className="text-[12px] text-ink-3">Enter a valid email address.</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="country">Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger id="country" className="w-full">
                <SelectValue placeholder="Select a country" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="website">
              Website <span className="text-ink-3">(optional)</span>
            </Label>
            <Input
              id="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              maxLength={300}
              placeholder="your-agency.com"
              autoComplete="url"
            />
          </div>
        </div>

        {/* Licence agreement — never pre-checked */}
        <div className="flex items-start gap-3 border-t border-hairline px-4 py-4 sm:px-6">
          <Checkbox
            id="licenceAccepted"
            checked={licenceAccepted}
            onCheckedChange={(checked) => setLicenceAccepted(checked === true)}
            aria-required
          />
          <Label htmlFor="licenceAccepted" className="grid gap-1 text-[13px] font-normal leading-relaxed text-ink-2">
            <span>
              I agree to the{" "}
              <a href="/license" className="underline decoration-hairline-strong underline-offset-2 hover:decoration-ink">
                LandingSentinel Agency Commercial Licence
              </a>{" "}
              and refund / technical guarantee terms.
            </span>
            <span className="text-[12px] text-ink-3">
              Plain-English summary:{" "}
              <a href="/license" className="underline decoration-hairline-strong underline-offset-2 hover:decoration-ink">
                licence summary
              </a>{" "}
              ·{" "}
              <a href="/license#full-licence" className="underline decoration-hairline-strong underline-offset-2 hover:decoration-ink">
                full licence
              </a>
            </span>
          </Label>
        </div>

        {/* Payment method */}
        <div className="border-t border-hairline px-4 py-4 sm:px-6">
          <MicroLabel>PAYMENT METHOD</MicroLabel>
          {configLoading ? (
            <div className="mt-3 flex items-center gap-2 text-[13px] text-ink-2">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Loading checkout
              configuration…
            </div>
          ) : !anyProvider ? (
            <div className="mt-3 border border-hairline bg-paper-deep px-4 py-3 text-[13px] leading-relaxed text-ink-2">
              <span className="font-semibold text-ink">Checkout is not configured on this deployment.</span>{" "}
              The seller must set the PayPal and/or Razorpay environment variables (see
              CONFIGURATION.md §payments). Nothing can be charged until then — this page will never
              pretend otherwise.
            </div>
          ) : (
            <RadioGroup
              value={effectiveProvider}
              onValueChange={(value) => setProvider(value === "razorpay" ? "razorpay" : "paypal")}
              className="mt-3 grid gap-3 sm:grid-cols-2"
            >
              <label
                className={`flex cursor-pointer items-start gap-3 border px-4 py-3 transition-colors ${
                  effectiveProvider === "paypal" ? "border-ink bg-paper-raised" : "border-hairline bg-paper"
                } ${paypalAvailable ? "" : "cursor-not-allowed opacity-60"}`}
              >
                <RadioGroupItem value="paypal" disabled={!paypalAvailable} className="mt-0.5" />
                <span className="grid gap-0.5">
                  <span className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
                    <CreditCard size={15} aria-hidden="true" /> PayPal
                  </span>
                  <span className="text-[12px] leading-relaxed text-ink-2">
                    International buyers — card or PayPal balance.
                    {paypalAvailable
                      ? config?.providers.paypal.mode === "sandbox"
                        ? " Sandbox mode: test payments only."
                        : ""
                      : " Not configured on this deployment."}
                  </span>
                </span>
              </label>
              <label
                className={`flex cursor-pointer items-start gap-3 border px-4 py-3 transition-colors ${
                  effectiveProvider === "razorpay" ? "border-ink bg-paper-raised" : "border-hairline bg-paper"
                } ${razorpayAvailable ? "" : "cursor-not-allowed opacity-60"}`}
              >
                <RadioGroupItem value="razorpay" disabled={!razorpayAvailable} className="mt-0.5" />
                <span className="grid gap-0.5">
                  <span className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
                    <Landmark size={15} aria-hidden="true" /> Razorpay
                  </span>
                  <span className="text-[12px] leading-relaxed text-ink-2">
                    India — UPI, cards, netbanking.
                    {razorpayAvailable && inrDisplay ? ` Fixed price ${inrDisplay}.` : ""}
                    {!razorpayAvailable ? " Not configured on this deployment." : ""}
                  </span>
                </span>
              </label>
            </RadioGroup>
          )}
        </div>

        {/* Submit */}
        <div className="flex flex-col items-start gap-3 border-t border-hairline px-4 py-5 sm:px-6">
          <Button
            size="lg"
            onClick={onSubmit}
            disabled={!formValid || submitting || configLoading}
            className="gap-2 rounded-[2px] px-6 py-3 text-[15px]"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Starting checkout…
              </>
            ) : (
              <>
                Continue to {effectiveProvider === "paypal" ? "PayPal" : "payment"}{" "}
                <ArrowRight size={16} aria-hidden="true" />
              </>
            )}
          </Button>
          {error ? (
            <p role="alert" className="max-w-xl text-[13px] leading-relaxed text-critical">
              {error}
            </p>
          ) : null}
          <p className="max-w-xl text-[12px] leading-relaxed text-ink-3">
            Payment is verified server-side before anything is confirmed. The purchase record stores
            your buyer details for delivery and support only (see the privacy page). Card data is
            never handled by this site — it stays with PayPal or Razorpay.
          </p>
        </div>
      </Sheet>
    </div>
  );
}
