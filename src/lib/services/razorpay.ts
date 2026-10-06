/**
 * Razorpay server-side integration (Orders API + signature verification).
 *
 * Security model (see SECURITY.md / DEPLOYMENT.md):
 * - RAZORPAY_KEY_SECRET never reaches client JavaScript. The browser only
 *   receives the public key id and the order id.
 * - Payment confirmation is verified server-side via the HMAC-SHA256
 *   checkout signature AND a server-side payment fetch (amount + status)
 *   before any purchase state changes.
 * - Webhook payloads are verified against RAZORPAY_WEBHOOK_SECRET.
 * - Comparisons are constant-time; no raw payloads are stored.
 *
 * Plain fetch + node:crypto only — no SDK dependency, fully mockable.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  apiBase: string;
};

export class RazorpayError extends Error {
  code: "ORDER_FAILED" | "PAYMENT_FETCH_FAILED" | "INVALID_RESPONSE";
  constructor(code: RazorpayError["code"], message: string) {
    super(message);
    this.name = "RazorpayError";
    this.code = code;
  }
}

/** Resolved per call (never at module load) so tests can override env. */
export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, apiBase: "https://api.razorpay.com/v1" };
}

export function razorpayWebhookSecret(): string | null {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  return secret ? secret : null;
}

function authHeader(config: RazorpayConfig): Record<string, string> {
  const basic = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");
  return { Authorization: `Basic ${basic}` };
}

/** Constant-time hex comparison (length mismatch fails closed). */
function hmacMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export type CreateRazorpayOrderInput = {
  purchaseId: string;
  amountMinor: number;
  currency: string;
  sku: string;
};

export async function createRazorpayOrder(
  config: RazorpayConfig,
  input: CreateRazorpayOrderInput
): Promise<{ orderId: string }> {
  const res = await fetch(`${config.apiBase}/orders`, {
    method: "POST",
    headers: {
      ...authHeader(config),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amountMinor,
      currency: input.currency,
      receipt: input.purchaseId,
      notes: {
        sku: input.sku,
        purchase_id: input.purchaseId,
      },
    }),
  });
  if (!res.ok) {
    throw new RazorpayError(
      "ORDER_FAILED",
      `Razorpay could not create the order (HTTP ${res.status}).`
    );
  }
  const order = (await res.json()) as { id?: string };
  if (!order.id) {
    throw new RazorpayError("INVALID_RESPONSE", "Razorpay returned an order without an id.");
  }
  return { orderId: order.id };
}

/* ------------------------------------------------------------------ */
/* Signature verification                                              */
/* ------------------------------------------------------------------ */

/**
 * Checkout handshake signature: HMAC-SHA256 of "{orderId}|{paymentId}"
 * keyed with the key secret. The browser receives this from Razorpay's
 * checkout and it is only ever trusted after this server-side check.
 */
export function verifyRazorpayCheckoutSignature(
  keySecret: string,
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const expected = createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return hmacMatches(expected, signature);
}

/**
 * Webhook signature: HMAC-SHA256 of the raw request body keyed with the
 * webhook secret, sent in the X-Razorpay-Signature header.
 */
export function verifyRazorpayWebhookSignature(
  webhookSecret: string,
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return hmacMatches(expected, signatureHeader);
}

/* ------------------------------------------------------------------ */
/* Payment fetch (server-side amount/status verification)              */
/* ------------------------------------------------------------------ */

export type RazorpayPayment = {
  paymentId: string;
  orderId: string | null;
  status: string;
  amountMinor: number;
  currency: string;
};

export async function fetchRazorpayPayment(
  config: RazorpayConfig,
  paymentId: string
): Promise<RazorpayPayment> {
  const res = await fetch(`${config.apiBase}/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
    headers: authHeader(config),
  });
  if (!res.ok) {
    throw new RazorpayError(
      "PAYMENT_FETCH_FAILED",
      `Razorpay could not return the payment (HTTP ${res.status}).`
    );
  }
  const payment = (await res.json()) as {
    id?: string;
    order_id?: string | null;
    status?: string;
    amount?: number;
    currency?: string;
  };
  if (!payment.id || typeof payment.amount !== "number" || !payment.currency) {
    throw new RazorpayError("INVALID_RESPONSE", "Razorpay returned an incomplete payment.");
  }
  return {
    paymentId: payment.id,
    orderId: payment.order_id ?? null,
    status: payment.status ?? "unknown",
    amountMinor: payment.amount,
    currency: payment.currency,
  };
}
