import { ok, fail, route, serverLog } from "@/lib/api/envelope";
import { getPayPalConfig, capturePayPalOrder, PayPalError } from "@/lib/services/paypal";
import {
  getRazorpayConfig,
  verifyRazorpayCheckoutSignature,
  fetchRazorpayPayment,
  RazorpayError,
} from "@/lib/services/razorpay";
import {
  getPurchase,
  markPurchasePaidIfVerified,
  purchaseReceipt,
  PurchaseError,
} from "@/lib/services/purchases";
import { purchaseConfirmSchema } from "@/lib/services/purchase-schema";

export const runtime = "nodejs";

/**
 * Server-authoritative payment confirmation.
 *
 * The browser's return from PayPal or the Razorpay modal is NEVER treated
 * as proof of payment — this endpoint performs the provider-side
 * verification (PayPal capture, or Razorpay HMAC signature + payment
 * fetch) and only then transitions the purchase to paid. A paid purchase
 * re-confirming is an idempotent success.
 */

export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const purchase = await getPurchase(id);
  if (!purchase) {
    return fail("NOT_FOUND", "This purchase reference does not exist.", 404);
  }

  // Idempotent: a paid purchase confirming again just gets its receipt.
  if (purchase.status === "paid") {
    return ok({ confirmed: true, alreadyPaid: true, receipt: purchaseReceipt(purchase) });
  }
  if (purchase.status === "failed" || purchase.status === "refunded") {
    return fail(
      "PAYMENT_FAILED",
      "This purchase was not completed. Start a new purchase to try again.",
      409
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = purchaseConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return fail("INVALID_INPUT", "The payment confirmation is incomplete.", 400);
  }
  const confirmation = parsed.data;

  if (confirmation.provider !== purchase.provider) {
    return fail("INVALID_INPUT", "This payment method does not match the purchase.", 400);
  }

  /* ---------------------------- PayPal ---------------------------- */
  if (confirmation.provider === "paypal") {
    const config = getPayPalConfig();
    if (!config) {
      return fail(
        "PAYMENT_UNAVAILABLE",
        "PayPal checkout is not configured on this deployment (see CONFIGURATION.md).",
        503
      );
    }
    let capture;
    try {
      capture = await capturePayPalOrder(config, confirmation.paypalOrderId);
    } catch (err) {
      const message =
        err instanceof PayPalError
          ? err.message
          : "The payment could not be verified with PayPal.";
      serverLog("warn", "purchase_capture_failed", {
        provider: "paypal",
        purchaseId: purchase.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return fail("PAYMENT_FAILED", message, 502);
    }

    if (capture.customId && capture.customId !== purchase.id) {
      return fail(
        "PAYMENT_FAILED",
        "This PayPal order does not belong to this purchase — rejected.",
        400
      );
    }
    if (capture.status !== "COMPLETED") {
      serverLog("warn", "purchase_capture_incomplete", {
        provider: "paypal",
        purchaseId: purchase.id,
        captureStatus: capture.status,
      });
      return fail(
        "PAYMENT_FAILED",
        `The payment is not completed at PayPal (status: ${capture.status}).`,
        402
      );
    }
    try {
      const result = await markPurchasePaidIfVerified(purchase.id, {
        provider: "paypal",
        providerOrderId: capture.orderId,
        providerPaymentId: capture.captureId,
        amountMinor: capture.amountMinor,
        currency: capture.currency,
      });
      serverLog("info", "purchase_paid", {
        provider: "paypal",
        purchaseId: purchase.id,
        transitioned: result.transitioned,
      });
      return ok({ confirmed: true, receipt: purchaseReceipt(result.purchase) });
    } catch (err) {
      return purchaseMismatchResponse(err, purchase.id, "paypal");
    }
  }

  /* --------------------------- Razorpay --------------------------- */
  const config = getRazorpayConfig();
  if (!config) {
    return fail(
      "PAYMENT_UNAVAILABLE",
      "Razorpay checkout is not configured on this deployment (see CONFIGURATION.md).",
      503
    );
  }

  const signatureValid = verifyRazorpayCheckoutSignature(
    config.keySecret,
    confirmation.razorpayOrderId,
    confirmation.razorpayPaymentId,
    confirmation.razorpaySignature
  );
  if (!signatureValid) {
    serverLog("warn", "purchase_signature_invalid", {
      provider: "razorpay",
      purchaseId: purchase.id,
    });
    return fail(
      "PAYMENT_FAILED",
      "The payment signature could not be verified — this payment was not accepted.",
      400
    );
  }

  let payment;
  try {
    payment = await fetchRazorpayPayment(config, confirmation.razorpayPaymentId);
  } catch (err) {
    const message =
      err instanceof RazorpayError
        ? err.message
        : "The payment could not be verified with Razorpay.";
    serverLog("warn", "purchase_payment_fetch_failed", {
      provider: "razorpay",
      purchaseId: purchase.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return fail("PAYMENT_FAILED", message, 502);
  }

  if (payment.orderId !== confirmation.razorpayOrderId) {
    return fail("PAYMENT_FAILED", "The payment does not belong to this order — rejected.", 400);
  }
  if (payment.status !== "captured") {
    return fail(
      "PAYMENT_FAILED",
      `The payment is not captured at Razorpay (status: ${payment.status}).`,
      402
    );
  }

  try {
    const result = await markPurchasePaidIfVerified(purchase.id, {
      provider: "razorpay",
      providerOrderId: confirmation.razorpayOrderId,
      providerPaymentId: confirmation.razorpayPaymentId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
    });
    serverLog("info", "purchase_paid", {
      provider: "razorpay",
      purchaseId: purchase.id,
      transitioned: result.transitioned,
    });
    return ok({ confirmed: true, receipt: purchaseReceipt(result.purchase) });
  } catch (err) {
    return purchaseMismatchResponse(err, purchase.id, "razorpay");
  }
});

function purchaseMismatchResponse(err: unknown, purchaseId: string, provider: string) {
  if (err instanceof PurchaseError) {
    serverLog("warn", "purchase_verification_mismatch", {
      provider,
      purchaseId,
      code: err.code,
    });
    return fail(
      "PAYMENT_FAILED",
      "The verified payment does not match this purchase (amount, currency or provider mismatch) — it was not accepted.",
      400
    );
  }
  throw err;
}
