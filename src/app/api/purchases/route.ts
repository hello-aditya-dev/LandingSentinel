import { ok, fail, route, serverLog } from "@/lib/api/envelope";
import { resolveSiteUrl } from "@/lib/site-url";
import { createPayPalOrder, PayPalError, getPayPalConfig } from "@/lib/services/paypal";
import {
  createRazorpayOrder,
  RazorpayError,
  getRazorpayConfig,
} from "@/lib/services/razorpay";
import {
  createPendingPurchase,
  attachProviderOrder,
  markPurchaseFailed,
  PricingError,
} from "@/lib/services/purchases";
import { purchaseBuyerSchema } from "@/lib/services/purchase-schema";
import {
  PRODUCT_SKU,
  LICENSE_EDITION,
  priceGbpMinor,
  priceInrMinor,
  formatMinorForDisplay,
} from "@/lib/services/pricing";

export const runtime = "nodejs";

/* ------------------------------------------------------------------ */
/* Public checkout configuration (GET)                                  */
/* ------------------------------------------------------------------ */
/* Tells /buy which providers are configured and what the fixed prices  */
/* are. Amounts come from the server's own configuration — the client   */
/* never sends an amount anywhere in the purchase flow.                 */

export const GET = route(async () => {
  const payPal = getPayPalConfig();
  const razorpay = getRazorpayConfig();
  const gbpMinor = priceGbpMinor();
  const inrMinor = priceInrMinor();
  return ok({
    providers: {
      paypal: { available: payPal !== null, mode: payPal?.env ?? null },
      razorpay: { available: razorpay !== null },
    },
    price: {
      gbpMinor,
      gbpDisplay: formatMinorForDisplay(gbpMinor, "GBP"),
      inrMinor,
      inrDisplay: inrMinor !== null ? formatMinorForDisplay(inrMinor, "INR") : null,
    },
    productSku: PRODUCT_SKU,
    licenseEdition: LICENSE_EDITION,
  });
});

/* ------------------------------------------------------------------ */
/* Purchase creation (POST)                                             */
/* ------------------------------------------------------------------ */
/* The strict schema (purchase-schema.ts) REJECTS unknown fields, so a  */
/* client can never smuggle status, amount, SKU or currency into a      */
/* purchase record. licenceAccepted must be explicitly true (the        */
/* checkbox starts unticked on /buy).                                   */

/* In-memory rate limiting (per instance, same documented limitation as
 * the public checker + login limiters — see SECURITY.md): a buyer gets a
 * handful of order-creation attempts per hour; a global ceiling stops
 * rotating-IP abuse of the provider APIs. */

const PER_IP_LIMIT = 6;
const PER_IP_WINDOW_MS = 60 * 60 * 1000;
const GLOBAL_LIMIT = 100;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;

const perIp = new Map<string, number[]>();
const globalHits: number[] = [];

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (perIp.get(ip) ?? []).filter((t) => t > now - PER_IP_WINDOW_MS);
  perIp.set(ip, hits);
  const global = globalHits.filter((t) => t > now - GLOBAL_WINDOW_MS);
  globalHits.length = 0;
  globalHits.push(...global);
  if (hits.length >= PER_IP_LIMIT || global.length >= GLOBAL_LIMIT) {
    return true;
  }
  hits.push(now);
  globalHits.push(now);
  return false;
}

function checkoutBaseUrl(req: Request): string {
  return resolveSiteUrl() ?? new URL(req.url).origin;
}

export const POST = route(async (req) => {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return fail(
      "RATE_LIMITED",
      "Too many checkout attempts from this address. Wait a while and try again.",
      429
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = purchaseBuyerSchema.safeParse(body);
  if (!parsed.success) {
    return fail("INVALID_INPUT", "The buyer details are incomplete or invalid.", 400, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const intent = parsed.data;

  // Optional website sanity check (stored as given — never fetched).
  if (
    intent.website &&
    !/^(https?:\/\/\S+|[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/\S*)?)$/i.test(intent.website)
  ) {
    return fail("INVALID_INPUT", "The website field does not look like a website address.", 400);
  }

  const base = checkoutBaseUrl(req);

  try {
    const purchase = await createPendingPurchase(intent);

    if (intent.provider === "paypal") {
      const config = getPayPalConfig();
      if (!config) {
        return fail(
          "PAYMENT_UNAVAILABLE",
          "PayPal checkout is not configured on this deployment. Set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_ENV (see CONFIGURATION.md).",
          503
        );
      }
      try {
        const order = await createPayPalOrder(config, {
          purchaseId: purchase.id,
          amountMinor: purchase.amountMinor,
          currency: purchase.currency,
          returnUrl: `${base}/buy/success?purchase=${purchase.id}&provider=paypal`,
          cancelUrl: `${base}/buy?cancelled=paypal`,
        });
        await attachProviderOrder(purchase.id, order.orderId);
        serverLog("info", "purchase_order_created", {
          provider: "paypal",
          purchaseId: purchase.id,
          amountMinor: purchase.amountMinor,
          currency: purchase.currency,
        });
        return ok(
          {
            provider: "paypal",
            purchaseId: purchase.id,
            approveUrl: order.approveUrl,
          },
          201
        );
      } catch (err) {
        await markPurchaseFailed(purchase.id);
        const message =
          err instanceof PayPalError
            ? err.message
            : "PayPal checkout could not be started on this deployment.";
        serverLog("warn", "purchase_order_failed", {
          provider: "paypal",
          purchaseId: purchase.id,
          error: err instanceof Error ? err.message : String(err),
        });
        return fail("PAYMENT_FAILED", message, 502);
      }
    }

    // razorpay
    const config = getRazorpayConfig();
    if (!config) {
      return fail(
        "PAYMENT_UNAVAILABLE",
        "Razorpay checkout is not configured on this deployment. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and LANDINGSENTINEL_PRICE_INR_MINOR (see CONFIGURATION.md).",
        503
      );
    }
    try {
      const order = await createRazorpayOrder(config, {
        purchaseId: purchase.id,
        amountMinor: purchase.amountMinor,
        currency: purchase.currency,
        sku: purchase.productSku,
      });
      await attachProviderOrder(purchase.id, order.orderId);
      serverLog("info", "purchase_order_created", {
        provider: "razorpay",
        purchaseId: purchase.id,
        amountMinor: purchase.amountMinor,
        currency: purchase.currency,
      });
      return ok(
        {
          provider: "razorpay",
          purchaseId: purchase.id,
          razorpayOrderId: order.orderId,
          // Public by design — the key id is safe for the client; the key
          // secret never leaves the server.
          razorpayKeyId: config.keyId,
          amountMinor: purchase.amountMinor,
          currency: purchase.currency,
        },
        201
      );
    } catch (err) {
      await markPurchaseFailed(purchase.id);
      const message =
        err instanceof RazorpayError
          ? err.message
          : "Razorpay checkout could not be started on this deployment.";
      serverLog("warn", "purchase_order_failed", {
        provider: "razorpay",
        purchaseId: purchase.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return fail("PAYMENT_FAILED", message, 502);
    }
  } catch (err) {
    if (err instanceof PricingError) {
      return fail("PAYMENT_UNAVAILABLE", err.message, 503);
    }
    throw err;
  }
});
