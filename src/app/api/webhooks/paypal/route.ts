import { ok, fail, route, serverLog } from "@/lib/api/envelope";
import {
  getPayPalConfig,
  payPalWebhookConfigured,
  verifyPayPalWebhookSignature,
} from "@/lib/services/paypal";
import {
  getPurchase,
  findPurchaseByProviderOrderId,
  markPurchasePaidIfVerified,
  PurchaseError,
} from "@/lib/services/purchases";

export const runtime = "nodejs";

/**
 * PayPal webhook — the provider-side confirmation channel.
 *
 * Signatures are verified through PayPal's verification API (transmission
 * headers + configured webhook id) before anything is acted on. Processing
 * is idempotent: a duplicate delivery of the same capture finds the
 * purchase already paid and is a no-op success. Unverifiable webhooks are
 * rejected (400); an unconfigured deployment answers 503 so PayPal
 * retries once the owner finishes configuration.
 */

type WebhookCapture = {
  id?: string;
  status?: string;
  custom_id?: string;
  invoice_id?: string;
  amount?: { value?: string; currency_code?: string };
};

type WebhookEvent = {
  event_type?: string;
  resource?: WebhookCapture & {
    purchase_units?: {
      custom_id?: string;
      payments?: { captures?: WebhookCapture[] };
    }[];
  };
};

export const POST = route(async (req) => {
  const rawBody = await req.text();

  const config = getPayPalConfig();
  if (!config || !payPalWebhookConfigured(config)) {
    serverLog("warn", "paypal_webhook_unconfigured", {});
    return fail(
      "PAYMENT_UNAVAILABLE",
      "PayPal webhooks are not configured on this deployment (PAYPAL_WEBHOOK_ID).",
      503
    );
  }

  const verified = await verifyPayPalWebhookSignature(config, req.headers, rawBody);
  if (!verified) {
    serverLog("warn", "paypal_webhook_invalid_signature", {});
    return fail("PAYMENT_FAILED", "Webhook signature verification failed.", 400);
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody) as WebhookEvent;
  } catch {
    return fail("INVALID_INPUT", "Webhook payload is not valid JSON.", 400);
  }

  const handled = await processEvent(event);
  return ok({ handled });
});

async function processEvent(event: WebhookEvent): Promise<string> {
  const type = event.event_type ?? "";

  // PAYMENT.CAPTURE.COMPLETED — the normal terminal event.
  if (type === "PAYMENT.CAPTURE.COMPLETED") {
    const resource = event.resource ?? {};
    const purchaseId = resource.custom_id ?? resource.invoice_id ?? "";
    const value = resource.amount?.value;
    if (!purchaseId || !resource.id || !value || !resource.amount?.currency_code) {
      serverLog("warn", "paypal_webhook_malformed", { eventType: type });
      return "malformed";
    }
    return await finalize(purchaseId, {
      provider: "paypal",
      providerOrderId: null,
      providerPaymentId: resource.id,
      amountMinor: Math.round(Number.parseFloat(value) * 100),
      currency: resource.amount.currency_code,
    });
  }

  // CHECKOUT.ORDER.COMPLETED — belt-and-braces (first webhook delivery
  // may arrive as the order event instead of the capture event).
  if (type === "CHECKOUT.ORDER.COMPLETED") {
    const resource = event.resource ?? {};
    const capture = resource.purchase_units?.[0]?.payments?.captures?.find((c) => c.id);
    const customId = resource.purchase_units?.[0]?.custom_id ?? resource.custom_id ?? "";
    const value = capture?.amount?.value;
    if (!capture?.id || !value || !capture.amount?.currency_code) {
      serverLog("warn", "paypal_webhook_malformed", { eventType: type });
      return "malformed";
    }
    // Prefer the order-id lookup; fall back to the custom id.
    const byOrder = resource.id ? await findPurchaseByProviderOrderId(resource.id) : null;
    const purchaseId = byOrder?.id ?? customId;
    if (!purchaseId) {
      serverLog("warn", "paypal_webhook_unknown_purchase", { eventType: type });
      return "unknown-purchase";
    }
    return await finalize(purchaseId, {
      provider: "paypal",
      providerOrderId: resource.id ?? null,
      providerPaymentId: capture.id,
      amountMinor: Math.round(Number.parseFloat(value) * 100),
      currency: capture.amount.currency_code,
    });
  }

  // Deliberately ignored event types (refunds are handled by the seller
  // through PayPal's dashboard during fulfillment — see SALES-HANDOFF.md).
  return "ignored";
}

async function finalize(
  purchaseId: string,
  verification: Parameters<typeof markPurchasePaidIfVerified>[1]
): Promise<string> {
  const purchase = await getPurchase(purchaseId);
  if (!purchase) {
    serverLog("warn", "paypal_webhook_unknown_purchase", { purchaseId });
    return "unknown-purchase";
  }
  try {
    const result = await markPurchasePaidIfVerified(purchaseId, verification);
    serverLog("info", "purchase_paid_webhook", {
      provider: "paypal",
      purchaseId,
      transitioned: result.transitioned,
    });
    return result.transitioned ? "paid" : "already-paid";
  } catch (err) {
    if (err instanceof PurchaseError) {
      serverLog("warn", "purchase_verification_mismatch", {
        provider: "paypal",
        purchaseId,
        code: err.code,
      });
      return `rejected:${err.code}`;
    }
    throw err;
  }
}
