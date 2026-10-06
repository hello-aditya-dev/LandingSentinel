/**
 * Purchase domain service.
 *
 * The Purchase record is the commercial ledger (see docs/SALES-HANDOFF.md).
 * Its invariant: `status` becomes "paid" ONLY through
 * markPurchasePaidIfVerified() — which is reachable exclusively from
 * server-side provider verification (PayPal capture result, Razorpay
 * signature + payment fetch, or an authenticated webhook). No client
 * request can set, influence or fake the paid state.
 *
 * Idempotency: a purchase already paid is a no-op success; unique
 * constraints on provider ids stop duplicate records; amount, currency,
 * provider and SKU are re-checked on every transition attempt.
 */

import type { Purchase } from "@prisma/client";
import { db } from "@/lib/db";
import {
  PRODUCT_SKU,
  LICENSE_EDITION,
  resolvePurchasePrice,
  PricingError,
} from "@/lib/services/pricing";

export type PurchaseProvider = "paypal" | "razorpay";

export type PurchaseIntent = {
  provider: PurchaseProvider;
  buyerName: string;
  buyerEmail: string;
  businessName: string;
  country: string;
  website?: string | null;
};

export class PurchaseError extends Error {
  code:
    | "PRICE_NOT_CONFIGURED"
    | "NOT_FOUND"
    | "PROVIDER_MISMATCH"
    | "AMOUNT_MISMATCH"
    | "CURRENCY_MISMATCH"
    | "SKU_MISMATCH";
  constructor(code: PurchaseError["code"], message: string) {
    super(message);
    this.name = "PurchaseError";
    this.code = code;
  }
}

export type PurchaseRecord = Purchase;

/**
 * Create a pending purchase with the SERVER-resolved price, SKU and licence
 * edition. The buyer's form contributes identity fields only — never
 * amount, currency, SKU or status.
 */
export async function createPendingPurchase(intent: PurchaseIntent): Promise<Purchase> {
  const price = resolvePurchasePrice(intent.provider); // throws PricingError when INR unset
  return db.purchase.create({
    data: {
      provider: intent.provider,
      buyerName: intent.buyerName.trim(),
      buyerEmail: intent.buyerEmail.trim().toLowerCase(),
      businessName: intent.businessName.trim(),
      country: intent.country.trim(),
      website: intent.website?.trim() || null,
      productSku: PRODUCT_SKU,
      licenseEdition: LICENSE_EDITION,
      amountMinor: price.amountMinor,
      currency: price.currency,
      status: "pending",
      licenceAcceptedAt: new Date(),
    },
  });
}

/** Attach the provider order id after successful provider order creation. */
export async function attachProviderOrder(
  purchaseId: string,
  providerOrderId: string
): Promise<void> {
  await db.purchase.update({
    where: { id: purchaseId },
    data: { providerOrderId },
  });
}

/** Record that provider order creation failed (audit trail, not an error). */
export async function markPurchaseFailed(purchaseId: string): Promise<void> {
  await db.purchase
    .update({ where: { id: purchaseId }, data: { status: "failed" } })
    .catch(() => {
      // Best-effort: the buyer sees the provider error either way.
    });
}

export type ProviderVerification = {
  provider: PurchaseProvider;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  amountMinor: number;
  currency: string;
};

export type MarkPaidResult =
  | { transitioned: true; purchase: Purchase }
  | { transitioned: false; purchase: Purchase; reason: "already-paid" };

/**
 * The ONLY path to paid. Idempotent: re-processing the same verified
 * payment (webhook + confirm race, provider retries) is a no-op success.
 * Any mismatch (provider, amount, currency) rejects the transition and the
 * purchase stays pending — wrong-amount or wrong-product payments can
 * never silently complete.
 */
export async function markPurchasePaidIfVerified(
  purchaseId: string,
  verification: ProviderVerification
): Promise<MarkPaidResult> {
  const purchase = await db.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) {
    throw new PurchaseError("NOT_FOUND", "Purchase not found.");
  }
  if (purchase.status === "paid") {
    return { transitioned: false, purchase, reason: "already-paid" };
  }
  if (purchase.status === "refunded") {
    throw new PurchaseError("PROVIDER_MISMATCH", "Purchase already refunded.");
  }
  if (purchase.provider !== verification.provider) {
    throw new PurchaseError(
      "PROVIDER_MISMATCH",
      "Verification provider does not match the purchase."
    );
  }
  // Defence in depth: even a tampered database row with the wrong SKU
  // cannot be transitioned to paid.
  if (purchase.productSku !== PRODUCT_SKU) {
    throw new PurchaseError(
      "SKU_MISMATCH",
      "Purchase product does not match the commercial SKU — rejected."
    );
  }
  if (purchase.amountMinor !== verification.amountMinor) {
    throw new PurchaseError(
      "AMOUNT_MISMATCH",
      "Verified amount does not match the purchase amount — rejected."
    );
  }
  if (purchase.currency !== verification.currency) {
    throw new PurchaseError(
      "CURRENCY_MISMATCH",
      "Verified currency does not match the purchase currency — rejected."
    );
  }

  const updated = await db.purchase.update({
    where: { id: purchaseId },
    data: {
      status: "paid",
      paidAt: new Date(),
      providerOrderId: verification.providerOrderId ?? purchase.providerOrderId,
      providerPaymentId: verification.providerPaymentId ?? purchase.providerPaymentId,
    },
  });
  return { transitioned: true, purchase: updated };
}

/** Find a purchase by the provider order id (webhook path). */
export async function findPurchaseByProviderOrderId(
  providerOrderId: string
): Promise<Purchase | null> {
  return db.purchase.findUnique({ where: { providerOrderId } });
}

export async function getPurchase(id: string): Promise<Purchase | null> {
  return db.purchase.findUnique({ where: { id } });
}

/**
 * Receipt view — safe fields for the buyer's success page. Buyer email is
 * only exposed once the purchase is paid; before that the endpoint
 * deliberately reveals nothing but the status.
 */
export type PurchaseReceipt = {
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

export function purchaseReceipt(purchase: Purchase): PurchaseReceipt {
  const receipt: PurchaseReceipt = {
    reference: purchase.id,
    status: purchase.status,
    provider: purchase.provider,
    amountMinor: purchase.amountMinor,
    currency: purchase.currency,
    productSku: purchase.productSku,
    licenseEdition: purchase.licenseEdition,
    fulfillmentStatus: purchase.fulfillmentStatus,
    paidAt: purchase.paidAt ? purchase.paidAt.toISOString() : null,
  };
  if (purchase.status === "paid") {
    receipt.buyerEmail = purchase.buyerEmail;
  }
  return receipt;
}

export { PricingError };
