import { ok, fail, route, serverLog } from "@/lib/api/envelope";
import {
  getRazorpayConfig,
  razorpayWebhookSecret,
  verifyRazorpayWebhookSignature,
} from "@/lib/services/razorpay";
import {
  getPurchase,
  findPurchaseByProviderOrderId,
  markPurchasePaidIfVerified,
  PurchaseError,
} from "@/lib/services/purchases";

export const runtime = "nodejs";

/**
 * Razorpay webhook — the provider-side confirmation channel.
 *
 * The X-Razorpay-Signature header is verified as an HMAC-SHA256 of the
 * raw request body keyed with RAZORPAY_WEBHOOK_SECRET before anything is
 * acted on. Processing is idempotent: a duplicate delivery of the same
 * payment.captured event finds the purchase already paid and is a no-op
 * success. Unverifiable webhooks are rejected (400); an unconfigured
 * deployment answers 503 so Razorpay retries once configuration lands.
 */

type WebhookEvent = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string | null;
        amount?: number;
        currency?: string;
        status?: string;
        notes?: Record<string, string>;
      };
    };
  };
};

export const POST = route(async (req) => {
  const rawBody = await req.text();

  const secret = razorpayWebhookSecret();
  const config = getRazorpayConfig();
  if (!secret || !config) {
    serverLog("warn", "razorpay_webhook_unconfigured", {});
    return fail(
      "PAYMENT_UNAVAILABLE",
      "Razorpay webhooks are not configured on this deployment (RAZORPAY_WEBHOOK_SECRET).",
      503
    );
  }

  const verified = verifyRazorpayWebhookSignature(
    secret,
    rawBody,
    req.headers.get("x-razorpay-signature")
  );
  if (!verified) {
    serverLog("warn", "razorpay_webhook_invalid_signature", {});
    return fail("PAYMENT_FAILED", "Webhook signature verification failed.", 400);
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody) as WebhookEvent;
  } catch {
    return fail("INVALID_INPUT", "Webhook payload is not valid JSON.", 400);
  }

  if (event.event !== "payment.captured") {
    // Deliberately ignored event types (refunds are handled by the seller
    // through Razorpay's dashboard during fulfillment — see SALES-HANDOFF.md).
    return ok({ handled: "ignored" });
  }

  const entity = event.payload?.payment?.entity;
  if (!entity?.id || !entity.order_id || typeof entity.amount !== "number" || !entity.currency) {
    serverLog("warn", "razorpay_webhook_malformed", {});
    return ok({ handled: "malformed" });
  }

  // Primary lookup: the provider order id attached at order creation.
  // Fallback: our note carrying the purchase id.
  const purchase =
    (await findPurchaseByProviderOrderId(entity.order_id)) ??
    (entity.notes?.purchase_id ? await getPurchase(entity.notes.purchase_id) : null);
  if (!purchase) {
    serverLog("warn", "razorpay_webhook_unknown_purchase", { orderId: entity.order_id });
    return ok({ handled: "unknown-purchase" });
  }

  try {
    const result = await markPurchasePaidIfVerified(purchase.id, {
      provider: "razorpay",
      providerOrderId: entity.order_id,
      providerPaymentId: entity.id,
      amountMinor: entity.amount,
      currency: entity.currency,
    });
    serverLog("info", "purchase_paid_webhook", {
      provider: "razorpay",
      purchaseId: purchase.id,
      transitioned: result.transitioned,
    });
    return ok({ handled: result.transitioned ? "paid" : "already-paid" });
  } catch (err) {
    if (err instanceof PurchaseError) {
      serverLog("warn", "purchase_verification_mismatch", {
        provider: "razorpay",
        purchaseId: purchase.id,
        code: err.code,
      });
      return ok({ handled: `rejected:${err.code}` });
    }
    throw err;
  }
});
