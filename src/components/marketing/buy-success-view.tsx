"use client";

/**
 * /buy/success — shows a confirmed purchase ONLY after the server has
 * verified the payment (capture or signature). The browser's redirect is
 * never trusted on its own: this view performs or awaits server
 * verification and refuses to render a success state without it.
 *
 * Below the payment confirmation, two secondary (post-purchase only)
 * blocks: custom engineering services and a referral request — never
 * shown before a completed purchase.
 */

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppNavigate } from "@/lib/nav";
import { api, ApiClientError } from "@/lib/client/api";
import { Sheet, MicroLabel, MarginNote, DossierLine } from "@/components/paper/paper";
import { CopyButton } from "@/components/paper/evidence";
import { Button } from "@/components/ui/button";
import { PRODUCT } from "@/config/product";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CircleAlert,
  Clock,
  Handshake,
  Mail,
  Loader2,
  PartyPopper,
} from "lucide-react";

type Receipt = {
  reference: string;
  status: string;
  provider: string;
  amountMinor: number;
  currency: string;
  productSku: string;
  licenseEdition: string;
  fulfillmentStatus: string;
  paidAt: string | null;
  buyerEmail?: string;
};

type ConfirmResponse = { confirmed: boolean; receipt: Receipt };

type Phase = "verifying" | "confirmed" | "not-completed" | "awaiting-webhook" | "invalid-reference";

const POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 3_000;

function providerLabel(provider: string): string {
  if (provider === "paypal") return "PayPal";
  if (provider === "razorpay") return "Razorpay";
  return provider;
}

function formatAmount(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

export function BuySuccessView() {
  const navigate = useAppNavigate();
  const searchParams = useSearchParams();

  const purchaseId = searchParams.get("purchase");
  const provider = searchParams.get("provider");
  const paypalToken = searchParams.get("token");

  const [phase, setPhase] = useState<Phase>("verifying");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !purchaseId) return;
    started.current = true;

    const applyReceipt = (next: Receipt) => {
      setReceipt(next);
      setPhase(next.status === "paid" ? "confirmed" : "awaiting-webhook");
    };

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    /** Poll the receipt; stop at paid or after a bounded number of tries. */
    const pollReceipt = async (): Promise<void> => {
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
        await sleep(attempt === 0 ? 500 : POLL_INTERVAL_MS);
        try {
          const next = await api<Receipt>(`/api/purchases/${purchaseId}`);
          setReceipt(next);
          if (next.status === "paid") {
            setPhase("confirmed");
            return;
          }
        } catch {
          // Network hiccup — retry.
        }
      }
      setPhase((prev) => (prev === "confirmed" ? prev : "awaiting-webhook"));
    };

    const confirm = async () => {
      if (provider === "razorpay") {
        const stored = sessionStorage.getItem(`ls_rzp_${purchaseId}`);
        if (stored) {
          try {
            const response = JSON.parse(stored) as {
              razorpay_order_id: string;
              razorpay_payment_id: string;
              razorpay_signature: string;
            };
            const result = await api<ConfirmResponse>(`/api/purchases/${purchaseId}/confirm`, {
              method: "POST",
              body: JSON.stringify({
                provider: "razorpay",
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });
            applyReceipt(result.receipt);
            sessionStorage.removeItem(`ls_rzp_${purchaseId}`);
            return;
          } catch (err) {
            if (err instanceof ApiClientError && err.code === "PAYMENT_FAILED") {
              setFailureMessage(err.message);
              setPhase("not-completed");
              return;
            }
            // Fall through to polling on unexpected errors.
          }
        }
        await pollReceipt();
        return;
      }

      // PayPal (default): the token query parameter is the order id; the
      // server captures and verifies it.
      if (!paypalToken) {
        await pollReceipt();
        return;
      }
      try {
        const result = await api<ConfirmResponse>(`/api/purchases/${purchaseId}/confirm`, {
          method: "POST",
          body: JSON.stringify({ provider: "paypal", paypalOrderId: paypalToken }),
        });
        applyReceipt(result.receipt);
      } catch (err) {
        if (err instanceof ApiClientError && (err.code === "PAYMENT_FAILED" || err.code === "NOT_FOUND")) {
          setFailureMessage(err.message);
          setPhase("not-completed");
          return;
        }
        await pollReceipt();
      }
    };

    void confirm();
  }, [purchaseId, provider, paypalToken]);

  // Without a purchase reference there is nothing to verify — derived, so
  // it renders identically on server and client.
  const effectivePhase: Phase = !purchaseId ? "invalid-reference" : phase;

  const supportEmail = PRODUCT.supportEmail;

  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 sm:px-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate({ view: "home" })}
        className="w-fit gap-2 px-0 text-ink-2"
      >
        <ArrowLeft size={14} aria-hidden="true" /> Back to LandingSentinel
      </Button>

      {/* ---------------- Verifying ---------------- */}
      {effectivePhase === "verifying" ? (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <Loader2 size={28} className="animate-spin text-ink-3" aria-hidden="true" />
          <h1 className="font-display text-2xl font-bold tracking-tight">Verifying your payment…</h1>
          <p className="max-w-md text-[14px] leading-relaxed text-ink-2">
            The server is confirming the payment with the provider. This page only shows a confirmed
            purchase after that verification succeeds.
          </p>
        </div>
      ) : null}

      {/* ---------------- Invalid reference ---------------- */}
      {effectivePhase === "invalid-reference" ? (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <CircleAlert size={28} className="text-ink-3" aria-hidden="true" />
          <h1 className="font-display text-2xl font-bold tracking-tight">No purchase reference</h1>
          <p className="max-w-md text-[14px] leading-relaxed text-ink-2">
            This page needs a purchase reference from checkout. If you just paid, use the link you
            were redirected to — or check your email for the purchase record.
          </p>
          <Button variant="outline" onClick={() => navigate({ view: "buy" })} className="gap-2">
            Back to purchase page <ArrowRight size={14} aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      {/* ---------------- Not completed ---------------- */}
      {effectivePhase === "not-completed" ? (
        <Sheet className="mt-10" label="PAYMENT NOT COMPLETED" title="Payment cancelled or failed">
          <div className="px-4 py-5 sm:px-6">
            <div className="flex items-start gap-3">
              <CircleAlert size={18} className="mt-0.5 shrink-0 text-critical" aria-hidden="true" />
              <p className="text-[14px] leading-relaxed text-ink-2">
                {failureMessage ??
                  "The payment was not completed, so nothing is confirmed and nothing will be delivered."}
              </p>
            </div>
            <Button onClick={() => navigate({ view: "buy" })} className="mt-5 gap-2 rounded-[2px]">
              Try again <ArrowRight size={14} aria-hidden="true" />
            </Button>
          </div>
        </Sheet>
      ) : null}

      {/* ---------------- Awaiting webhook ---------------- */}
      {effectivePhase === "awaiting-webhook" ? (
        <Sheet className="mt-10" label="PAYMENT PENDING" title="Not confirmed yet">
          <div className="px-4 py-5 sm:px-6">
            <div className="flex items-start gap-3">
              <Clock size={18} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
              <div className="grid gap-2 text-[14px] leading-relaxed text-ink-2">
                <p>
                  We could not confirm this payment yet. If you completed the payment, the
                  provider&apos;s confirmation will finalize the record automatically — usually within
                  a minute.
                </p>
                <p>
                  Keep this purchase reference for support:{" "}
                  <span className="num font-mono text-[12.5px] text-ink">
                    {receipt?.reference ?? purchaseId ?? "— see your purchase email"}
                  </span>
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="mt-5 gap-2"
            >
              <Loader2 size={14} aria-hidden="true" /> Check again
            </Button>
          </div>
        </Sheet>
      ) : null}

      {/* ---------------- Confirmed ---------------- */}
      {effectivePhase === "confirmed" && receipt ? (
        <>
          <div className="mt-8 flex items-center gap-3">
            <BadgeCheck size={30} className="text-healthy" aria-hidden="true" />
            <h1 className="font-display text-3xl font-bold tracking-tight">Purchase confirmed</h1>
          </div>
          <DossierLine
            className="mt-3"
            items={["PURCHASE RECORD / PAID", `EDITION ${receipt.licenseEdition}`]}
          />

          <Sheet className="mt-5" label="LANDINGSENTINEL AGENCY COMMERCIAL LICENCE" title="What you bought">
            <div className="grid gap-px bg-hairline sm:grid-cols-2">
              <div className="bg-paper px-4 py-4 sm:px-5">
                <MicroLabel>AMOUNT</MicroLabel>
                <p className="num mt-1 font-mono text-2xl font-bold tabular-nums">
                  {formatAmount(receipt.amountMinor, receipt.currency)}
                </p>
              </div>
              <div className="bg-paper px-4 py-4 sm:px-5">
                <MicroLabel>PAYMENT PROVIDER</MicroLabel>
                <p className="mt-1 text-[15px] font-medium text-ink">{providerLabel(receipt.provider)}</p>
              </div>
              <div className="bg-paper px-4 py-4 sm:px-5">
                <MicroLabel>PURCHASE REFERENCE</MicroLabel>
                <p className="num mt-1 flex items-center gap-2 font-mono text-[13px] text-ink">
                  {receipt.reference}
                  <CopyButton text={receipt.reference} label="Copy" />
                </p>
              </div>
              <div className="bg-paper px-4 py-4 sm:px-5">
                <MicroLabel>BUYER EMAIL</MicroLabel>
                <p className="mt-1 break-all text-[14px] text-ink">{receipt.buyerEmail ?? "—"}</p>
              </div>
            </div>
            <div className="px-4 py-4 sm:px-6">
              <MarginNote>
                Your LandingSentinel commercial source package will be delivered to the purchase
                email. For this first commercial release, delivery is verified manually by the
                seller — you will receive the package, the licence and the Quick Start shortly.
              </MarginNote>
              <p className="mt-3 text-[13px] font-medium text-ink">
                Keep this purchase reference for support.
              </p>
            </div>
          </Sheet>

          {/* ---- Secondary: custom engineering (post-purchase only) ---- */}
          <section className="mt-6 border border-hairline bg-paper-raised px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2">
              <PartyPopper size={16} className="text-ink-3" aria-hidden="true" />
              <h2 className="font-display text-[15px] font-semibold">Want it customized?</h2>
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
              Custom integrations, agency-specific workflows and implementation work are available
              separately from the software licence.
            </p>
            {supportEmail ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-2"
                onClick={() => {
                  window.location.href = `mailto:${supportEmail}?subject=${encodeURIComponent(
                    "LandingSentinel customization"
                  )}`;
                }}
              >
                <Mail size={14} aria-hidden="true" /> Discuss customization
              </Button>
            ) : (
              <p className="mt-2 text-[12.5px] text-ink-3">
                Reply to your purchase email to discuss customization.
              </p>
            )}
          </section>

          {/* ---- Secondary: referral (post-purchase only) ---- */}
          <section className="mt-4 border border-hairline bg-paper-raised px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2">
              <Handshake size={16} className="text-ink-3" aria-hidden="true" />
              <h2 className="font-display text-[15px] font-semibold">
                Know another performance agency that would use this?
              </h2>
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
              An introduction is always appreciated.
            </p>
            <CopyButton
              className="mt-3"
              text={`I've been using LandingSentinel for paid-media landing-page preflight — thought of you: ${
                typeof window !== "undefined" ? window.location.origin : ""
              }/demo`}
              label="Refer an agency (copy message)"
            />
          </section>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate({ view: "home" })} className="gap-2 px-0 text-ink-2">
              <ArrowLeft size={14} aria-hidden="true" /> Back to LandingSentinel
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
