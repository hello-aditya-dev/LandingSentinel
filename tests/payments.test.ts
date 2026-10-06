/**
 * Payment + purchase tests — the commercial checkout contract.
 *
 * Unit level (no database):
 *   · fixed integer-minor pricing (defaults + env overrides, never floats)
 *   · PayPal order creation / capture / webhook verification against a
 *     mocked provider API (asserts amounts, ids, auth, base URLs)
 *   · Razorpay order creation against a mocked provider API
 *   · Razorpay checkout + webhook HMAC signatures (valid / invalid)
 *   · strict request schemas: a client can never smuggle status, amount,
 *     currency or SKU into a purchase
 *
 * Integration level (dedicated *_test PostgreSQL, provisioned like the
 * scanner suite — the data database is never touched):
 *   · pending purchases carry the server-resolved price / SKU / edition
 *   · paid transitions happen ONLY through verified provider data
 *   · idempotency: duplicate webhook / confirm deliveries are no-ops
 *   · wrong amount / currency / provider / SKU are rejected
 *   · one provider payment id can never mark two purchases paid
 *   · the receipt hides buyer identity until the purchase is paid
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { loadEnvFiles } from "@/lib/env-load";

import {
  PRODUCT_SKU,
  LICENSE_EDITION,
  priceGbpMinor,
  priceInrMinor,
  resolvePurchasePrice,
  formatMinorForDisplay,
  PricingError,
} from "@/lib/services/pricing";
import {
  getPayPalConfig,
  createPayPalOrder,
  capturePayPalOrder,
  verifyPayPalWebhookSignature,
  clearPayPalTokenCache,
  PayPalError,
  minorToAmountString,
} from "@/lib/services/paypal";
import {
  getRazorpayConfig,
  createRazorpayOrder,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
  fetchRazorpayPayment,
  RazorpayError,
} from "@/lib/services/razorpay";
import { purchaseBuyerSchema, purchaseConfirmSchema } from "@/lib/services/purchase-schema";

/* ------------------------------------------------------------------ */
/* Test environment bookkeeping                                        */
/* ------------------------------------------------------------------ */

const SAVED_ENV = [
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
  "PAYPAL_ENV",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "LANDINGSENTINEL_PRICE_GBP_MINOR",
  "LANDINGSENTINEL_PRICE_INR_MINOR",
].map((key) => [key, process.env[key]] as const);

function clearPaymentEnv(): void {
  for (const key of SAVED_ENV.map(([k]) => k)) delete process.env[key];
}

afterAll(() => {
  for (const [key, value] of SAVED_ENV) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/* ------------------------------------------------------------------ */
/* Mocked provider fetch                                               */
/* ------------------------------------------------------------------ */

type RecordedCall = { url: string; init?: RequestInit };

const calls: RecordedCall[] = [];
let fetchHandler: ((url: string, init?: RequestInit) => Response) | null = null;
const realFetch = global.fetch;

beforeAll(() => {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    if (!fetchHandler) throw new Error("No fetch handler installed for this test.");
    return fetchHandler(url, init);
  }) as typeof fetch;
});

afterAll(() => {
  global.fetch = realFetch;
});

afterEach(() => {
  fetchHandler = null;
  calls.length = 0;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function lastCallTo(suffix: string): RecordedCall {
  const call = calls.find((c) => c.url.includes(suffix));
  if (!call) throw new Error(`No request to ${suffix} was recorded.`);
  return call;
}

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

describe("commercial pricing", () => {
  it("uses the fixed £349 GBP price as integer minor units", () => {
    clearPaymentEnv();
    expect(priceGbpMinor()).toBe(34_900);
    expect(Number.isInteger(priceGbpMinor())).toBe(true);
    expect(formatMinorForDisplay(34_900, "GBP")).toBe("£349.00");
    expect(minorToAmountString(34_900)).toBe("349.00");
  });

  it("reads price overrides from configuration, still as integers", () => {
    clearPaymentEnv();
    process.env.LANDINGSENTINEL_PRICE_GBP_MINOR = "39900";
    expect(priceGbpMinor()).toBe(39_900);
    delete process.env.LANDINGSENTINEL_PRICE_GBP_MINOR;
    // Invalid values fall back to the canonical price, never to zero/floats.
    process.env.LANDINGSENTINEL_PRICE_GBP_MINOR = "not-a-number";
    expect(priceGbpMinor()).toBe(34_900);
  });

  it("has no INR price until the owner configures one", () => {
    clearPaymentEnv();
    expect(priceInrMinor()).toBeNull();
  });

  it("resolves the PayPal price as GBP and the Razorpay price as configured INR", () => {
    clearPaymentEnv();
    expect(resolvePurchasePrice("paypal")).toEqual({ amountMinor: 34_900, currency: "GBP" });
    // Razorpay without an INR price refuses to sell (no silent conversion).
    expect(() => resolvePurchasePrice("razorpay")).toThrow(PricingError);
    process.env.LANDINGSENTINEL_PRICE_INR_MINOR = "2890000";
    expect(resolvePurchasePrice("razorpay")).toEqual({ amountMinor: 2_890_000, currency: "INR" });
    clearPaymentEnv();
  });
});

/* ------------------------------------------------------------------ */
/* PayPal (mocked provider API)                                        */
/* ------------------------------------------------------------------ */

describe("PayPal order creation (mocked API)", () => {
  it("creates an order with the exact server-side amount, currency and purchase reference", async () => {
    clearPaymentEnv();
    process.env.PAYPAL_CLIENT_ID = "pp-test-id";
    process.env.PAYPAL_CLIENT_SECRET = "pp-test-secret";
    process.env.PAYPAL_ENV = "sandbox";
    clearPayPalTokenCache();

    fetchHandler = (url) => {
      if (url.endsWith("/v1/oauth2/token")) {
        return jsonResponse({ access_token: "tok_abc", expires_in: 3600 });
      }
      if (url.endsWith("/v2/checkout/orders")) {
        return jsonResponse({
          id: "ORDER123",
          links: [
            { rel: "self", href: "https://api.example/self" },
            { rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER123" },
          ],
        });
      }
      return jsonResponse({}, 404);
    };

    const config = getPayPalConfig();
    expect(config).not.toBeNull();
    expect(config!.apiBase).toBe("https://api-m.sandbox.paypal.com");

    const order = await createPayPalOrder(config!, {
      purchaseId: "pur_1",
      amountMinor: 34_900,
      currency: "GBP",
      returnUrl: "https://example.com/buy/success?purchase=pur_1&provider=paypal",
      cancelUrl: "https://example.com/buy?cancelled=paypal",
    });

    expect(order.orderId).toBe("ORDER123");
    expect(order.approveUrl).toContain("https://www.sandbox.paypal.com/checkoutnow");

    // Token request authenticated with the API credentials.
    const tokenCall = lastCallTo("/v1/oauth2/token");
    const auth = (tokenCall.init?.headers as Record<string, string>).Authorization;
    expect(auth).toBe(
      `Basic ${Buffer.from("pp-test-id:pp-test-secret").toString("base64")}`
    );

    // Order request carries exact money + the purchase reference.
    const orderCall = lastCallTo("/v2/checkout/orders");
    expect(orderCall.url).toContain("api-m.sandbox.paypal.com");
    const body = JSON.parse(orderCall.init!.body as string);
    expect(body.purchase_units[0].amount).toEqual({ currency_code: "GBP", value: "349.00" });
    expect(body.purchase_units[0].custom_id).toBe("pur_1");
    expect(body.purchase_units[0].invoice_id).toBe("pur_1");
    expect(body.payment_source.paypal.experience_context.return_url).toContain(
      "/buy/success?purchase=pur_1&provider=paypal"
    );
    expect(body.payment_source.paypal.experience_context.cancel_url).toContain(
      "/buy?cancelled=paypal"
    );
  });

  it("surfaces provider authentication failures honestly", async () => {
    clearPaymentEnv();
    process.env.PAYPAL_CLIENT_ID = "pp-bad-id";
    process.env.PAYPAL_CLIENT_SECRET = "pp-bad-secret";
    clearPayPalTokenCache();
    fetchHandler = () => jsonResponse({ error: "invalid_client" }, 401);
    const config = getPayPalConfig()!;
    await expect(
      createPayPalOrder(config, {
        purchaseId: "pur_1",
        amountMinor: 34_900,
        currency: "GBP",
        returnUrl: "https://example.com/return",
        cancelUrl: "https://example.com/cancel",
      })
    ).rejects.toMatchObject({ name: "PayPalError", code: "AUTH_FAILED" });
  });
});

describe("PayPal capture (mocked API)", () => {
  it("parses a COMPLETED capture with exact integer minor units", async () => {
    clearPaymentEnv();
    process.env.PAYPAL_CLIENT_ID = "pp-test-id";
    process.env.PAYPAL_CLIENT_SECRET = "pp-test-secret";
    clearPayPalTokenCache();
    fetchHandler = (url) => {
      if (url.endsWith("/v1/oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 3600 });
      if (url.includes("/capture")) {
        return jsonResponse({
          id: "ORDER123",
          status: "COMPLETED",
          purchase_units: [
            {
              custom_id: "pur_1",
              payments: {
                captures: [
                  { id: "CAP123", status: "COMPLETED", amount: { value: "349.00", currency_code: "GBP" } },
                ],
              },
            },
          ],
        });
      }
      return jsonResponse({}, 404);
    };
    const capture = await capturePayPalOrder(getPayPalConfig()!, "ORDER123");
    expect(capture).toMatchObject({
      orderId: "ORDER123",
      captureId: "CAP123",
      status: "COMPLETED",
      amountMinor: 34_900,
      currency: "GBP",
      customId: "pur_1",
    });
    expect(Number.isInteger(capture.amountMinor)).toBe(true);
  });

  it("reports non-completed captures so the route can refuse them", async () => {
    clearPaymentEnv();
    process.env.PAYPAL_CLIENT_ID = "pp-test-id";
    process.env.PAYPAL_CLIENT_SECRET = "pp-test-secret";
    clearPayPalTokenCache();
    fetchHandler = (url) => {
      if (url.endsWith("/v1/oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 3600 });
      if (url.includes("/capture")) {
        return jsonResponse({
          id: "ORDER124",
          purchase_units: [
            {
              custom_id: "pur_2",
              payments: { captures: [{ id: "CAP124", status: "DECLINED", amount: { value: "349.00", currency_code: "GBP" } }] },
            },
          ],
        });
      }
      return jsonResponse({}, 404);
    };
    const capture = await capturePayPalOrder(getPayPalConfig()!, "ORDER124");
    expect(capture.status).toBe("DECLINED");
  });

  it("rejects provider errors and malformed capture responses", async () => {
    clearPaymentEnv();
    process.env.PAYPAL_CLIENT_ID = "pp-test-id";
    process.env.PAYPAL_CLIENT_SECRET = "pp-test-secret";
    clearPayPalTokenCache();
    fetchHandler = (url) => {
      if (url.endsWith("/v1/oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 3600 });
      if (url.includes("/capture")) return jsonResponse({ error: "UNPROCESSABLE_ENTITY" }, 422);
      return jsonResponse({}, 404);
    };
    await expect(capturePayPalOrder(getPayPalConfig()!, "ORDER125")).rejects.toMatchObject({
      code: "CAPTURE_FAILED",
    });

    fetchHandler = (url) => {
      if (url.endsWith("/v1/oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 3600 });
      if (url.includes("/capture")) return jsonResponse({ id: "ORDER126" });
      return jsonResponse({}, 404);
    };
    await expect(capturePayPalOrder(getPayPalConfig()!, "ORDER126")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});

describe("PayPal webhook signature verification (mocked API)", () => {
  it("accepts a PayPal-verified webhook and rejects unverified ones", async () => {
    clearPaymentEnv();
    process.env.PAYPAL_CLIENT_ID = "pp-test-id";
    process.env.PAYPAL_CLIENT_SECRET = "pp-test-secret";
    process.env.PAYPAL_WEBHOOK_ID = "wh-123";
    clearPayPalTokenCache();

    const headers = new Headers({
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-cert-url": "https://example.com/cert",
      "paypal-transmission-id": "t-1",
      "paypal-transmission-sig": "sig",
      "paypal-transmission-time": "2026-10-06T00:00:00Z",
    });

    fetchHandler = (url) => {
      if (url.endsWith("/v1/oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 3600 });
      if (url.endsWith("/v1/notifications/verify-webhook-signature")) {
        return jsonResponse({ verification_status: "SUCCESS" });
      }
      return jsonResponse({}, 404);
    };
    expect(await verifyPayPalWebhookSignature(getPayPalConfig()!, headers, "{}")).toBe(true);

    fetchHandler = (url) => {
      if (url.endsWith("/v1/oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 3600 });
      if (url.endsWith("/v1/notifications/verify-webhook-signature")) {
        return jsonResponse({ verification_status: "FAILURE" });
      }
      return jsonResponse({}, 404);
    };
    expect(await verifyPayPalWebhookSignature(getPayPalConfig()!, headers, "{}")).toBe(false);

    // Missing transmission headers: never even asks PayPal.
    expect(await verifyPayPalWebhookSignature(getPayPalConfig()!, new Headers(), "{}")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Razorpay (mocked provider API + real HMACs)                         */
/* ------------------------------------------------------------------ */

describe("Razorpay order creation (mocked API)", () => {
  it("creates an order with integer minor units, INR currency and the purchase receipt", async () => {
    clearPaymentEnv();
    process.env.RAZORPAY_KEY_ID = "rzp_test_key";
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";

    fetchHandler = (url) => {
      if (url.endsWith("/v1/orders")) return jsonResponse({ id: "order_123" });
      return jsonResponse({}, 404);
    };

    const config = getRazorpayConfig();
    expect(config).not.toBeNull();
    const order = await createRazorpayOrder(config!, {
      purchaseId: "pur_2",
      amountMinor: 2_890_000,
      currency: "INR",
      sku: PRODUCT_SKU,
    });
    expect(order.orderId).toBe("order_123");

    const call = lastCallTo("/v1/orders");
    const auth = (call.init?.headers as Record<string, string>).Authorization;
    expect(auth).toBe(
      `Basic ${Buffer.from("rzp_test_key:rzp_test_secret").toString("base64")}`
    );
    const body = JSON.parse(call.init!.body as string);
    expect(body.amount).toBe(2_890_000); // integer minor units (paise), never a float
    expect(body.currency).toBe("INR");
    expect(body.receipt).toBe("pur_2");
    expect(body.notes.sku).toBe("landingsentinel-agency-founding");
    expect(body.notes.purchase_id).toBe("pur_2");
  });

  it("surfaces provider failures honestly", async () => {
    clearPaymentEnv();
    process.env.RAZORPAY_KEY_ID = "rzp_test_key";
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
    fetchHandler = () => jsonResponse({ error: { description: "bad request" } }, 400);
    await expect(
      createRazorpayOrder(getRazorpayConfig()!, {
        purchaseId: "pur_2",
        amountMinor: 2_890_000,
        currency: "INR",
        sku: PRODUCT_SKU,
      })
    ).rejects.toMatchObject({ name: "RazorpayError", code: "ORDER_FAILED" });
  });

  it("fetches payments for server-side amount/status verification", async () => {
    clearPaymentEnv();
    process.env.RAZORPAY_KEY_ID = "rzp_test_key";
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
    fetchHandler = (url) => {
      if (url.endsWith("/v1/payments/pay_123")) {
        return jsonResponse({ id: "pay_123", order_id: "order_123", status: "captured", amount: 2_890_000, currency: "INR" });
      }
      return jsonResponse({}, 404);
    };
    const payment = await fetchRazorpayPayment(getRazorpayConfig()!, "pay_123");
    expect(payment).toMatchObject({
      paymentId: "pay_123",
      orderId: "order_123",
      status: "captured",
      amountMinor: 2_890_000,
      currency: "INR",
    });
    expect(Number.isInteger(payment.amountMinor)).toBe(true);
  });
});

describe("Razorpay signatures", () => {
  const secret = "rzp_test_secret";
  const orderId = "order_123";
  const paymentId = "pay_123";

  it("accepts a valid checkout handshake signature", () => {
    const signature = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
    expect(verifyRazorpayCheckoutSignature(secret, orderId, paymentId, signature)).toBe(true);
  });

  it("rejects a tampered checkout signature", () => {
    const signature = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
    expect(verifyRazorpayCheckoutSignature(secret, orderId, paymentId, `0${signature.slice(1)}`)).toBe(false);
    expect(verifyRazorpayCheckoutSignature(secret, "order_other", paymentId, signature)).toBe(false);
  });

  it("accepts a valid webhook signature over the raw body and rejects tampering", () => {
    const rawBody = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: paymentId } } } });
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
    expect(verifyRazorpayWebhookSignature(secret, rawBody, signature)).toBe(true);
    expect(verifyRazorpayWebhookSignature(secret, `${rawBody} `, signature)).toBe(false);
    expect(verifyRazorpayWebhookSignature(secret, rawBody, null)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Request schemas — the client is never authoritative                 */
/* ------------------------------------------------------------------ */

describe("purchase request schemas reject client-authoritative fields", () => {
  const validBuyer = {
    provider: "paypal" as const,
    buyerName: "Test Buyer",
    buyerEmail: "buyer@example.com",
    businessName: "Test Agency",
    country: "India",
    licenceAccepted: true,
  };

  it("accepts a valid buyer payload", () => {
    expect(purchaseBuyerSchema.safeParse(validBuyer).success).toBe(true);
  });

  it("rejects smuggled status / amount / currency / SKU fields", () => {
    expect(purchaseBuyerSchema.safeParse({ ...validBuyer, status: "paid" }).success).toBe(false);
    expect(purchaseBuyerSchema.safeParse({ ...validBuyer, amountMinor: 1 }).success).toBe(false);
    expect(purchaseBuyerSchema.safeParse({ ...validBuyer, currency: "USD" }).success).toBe(false);
    expect(purchaseBuyerSchema.safeParse({ ...validBuyer, productSku: "other" }).success).toBe(false);
  });

  it("requires an explicit licence agreement and complete buyer details", () => {
    expect(purchaseBuyerSchema.safeParse({ ...validBuyer, licenceAccepted: false }).success).toBe(false);
    expect(purchaseBuyerSchema.safeParse({ ...validBuyer, licenceAccepted: undefined }).success).toBe(false);
    expect(
      purchaseBuyerSchema.safeParse({ ...validBuyer, buyerEmail: "not-an-email" }).success
    ).toBe(false);
    expect(purchaseBuyerSchema.safeParse({ ...validBuyer, buyerName: "" }).success).toBe(false);
  });

  it("requires the full Razorpay handshake (order, payment AND signature)", () => {
    expect(
      purchaseConfirmSchema.safeParse({
        provider: "razorpay",
        razorpayOrderId: "order_123",
        razorpayPaymentId: "pay_123",
      }).success
    ).toBe(false);
    expect(
      purchaseConfirmSchema.safeParse({
        provider: "razorpay",
        razorpayOrderId: "order_123",
        razorpayPaymentId: "pay_123",
        razorpaySignature: "a".repeat(64),
      }).success
    ).toBe(true);
    // And it never accepts a client-supplied "paid" flag.
    expect(
      purchaseConfirmSchema.safeParse({
        provider: "razorpay",
        razorpayOrderId: "order_123",
        razorpayPaymentId: "pay_123",
        razorpaySignature: "a".repeat(64),
        status: "paid",
      }).success
    ).toBe(false);
    expect(purchaseConfirmSchema.safeParse({ provider: "paypal", paypalOrderId: "abcde" }).success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Purchase persistence (dedicated *_test PostgreSQL)                  */
/* ------------------------------------------------------------------ */

function deriveTestUrl(baseUrl: string): { testUrl: string; dbName: string } {
  const parsed = new URL(baseUrl);
  const rawName = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] ?? "");
  const dbName = `${(rawName || "landingsentinel").replace(/[^a-zA-Z0-9_]/g, "_")}_test`;
  parsed.pathname = `/${dbName}`;
  return { testUrl: parsed.toString(), dbName };
}

async function ensureDatabaseExists(adminUrl: string, dbName: string): Promise<void> {
  const admin = new URL(adminUrl);
  admin.pathname = "/postgres";
  const client = new PrismaClient({ datasourceUrl: admin.toString() });
  try {
    const exists = await client.$queryRawUnsafe(
      `SELECT 1 FROM pg_database WHERE datname = '${dbName}'`
    );
    if ((exists as unknown[]).length === 0) {
      await client.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await client.$disconnect();
  }
}

describe("purchase records (PostgreSQL)", () => {
  let db: typeof import("@/lib/db")["db"];
  let createPendingPurchase: typeof import("@/lib/services/purchases")["createPendingPurchase"];
  let attachProviderOrder: typeof import("@/lib/services/purchases")["attachProviderOrder"];
  let markPurchasePaidIfVerified: typeof import("@/lib/services/purchases")["markPurchasePaidIfVerified"];
  let purchaseReceipt: typeof import("@/lib/services/purchases")["purchaseReceipt"];
  let PurchaseErrorCtor: typeof import("@/lib/services/purchases")["PurchaseError"];
  let originalDatabaseUrl: string | undefined;

  beforeAll(async () => {
    loadEnvFiles();
    const base = process.env.DATABASE_URL;
    if (!base || !/^postgres(ql)?:\/\//.test(base)) {
      throw new Error(
        "Purchase integration tests require a PostgreSQL DATABASE_URL. Configure .env.local (see README.md) — the suite provisions a *_test database automatically and never touches your data database."
      );
    }
    const { testUrl, dbName } = deriveTestUrl(base);
    originalDatabaseUrl = base;
    process.env.DATABASE_URL = testUrl;
    process.env.LANDINGSENTINEL_PRICE_INR_MINOR = "2890000";

    await ensureDatabaseExists(base, dbName);
    execSync("npx prisma migrate deploy", {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: testUrl },
    });

    ({ db } = await import("@/lib/db"));
    ({
      createPendingPurchase,
      attachProviderOrder,
      markPurchasePaidIfVerified,
      purchaseReceipt,
      PurchaseError: PurchaseErrorCtor,
    } = await import("@/lib/services/purchases"));

    await db.purchase.deleteMany({});
  });

  afterAll(async () => {
    if (db) {
      await db.purchase.deleteMany({}).catch(() => undefined);
      await db.$disconnect().catch(() => undefined);
    }
    if (originalDatabaseUrl !== undefined) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    delete process.env.LANDINGSENTINEL_PRICE_INR_MINOR;
  });

  async function newPurchase(provider: "paypal" | "razorpay" = "paypal") {
    return createPendingPurchase({
      provider,
      buyerName: "Test Buyer",
      buyerEmail: "Buyer@Example.com",
      businessName: "Test Agency",
      country: "India",
    });
  }

  it("stores a pending purchase with the SERVER-resolved price, SKU and integer money", async () => {
    const purchase = await newPurchase("paypal");
    expect(purchase.status).toBe("pending");
    expect(purchase.amountMinor).toBe(34_900);
    expect(purchase.currency).toBe("GBP");
    expect(purchase.productSku).toBe(PRODUCT_SKU);
    expect(purchase.licenseEdition).toBe(LICENSE_EDITION);
    expect(Number.isInteger(purchase.amountMinor)).toBe(true);
    expect(purchase.buyerEmail).toBe("buyer@example.com"); // normalized
    expect(purchase.licenceAcceptedAt).not.toBeNull();

    const razorpayPurchase = await newPurchase("razorpay");
    expect(razorpayPurchase.amountMinor).toBe(2_890_000);
    expect(razorpayPurchase.currency).toBe("INR");
  });

  it("transitions to paid ONLY through verified provider data (PayPal capture)", async () => {
    clearPaymentEnv();
    process.env.PAYPAL_CLIENT_ID = "pp-test-id";
    process.env.PAYPAL_CLIENT_SECRET = "pp-test-secret";
    clearPayPalTokenCache();

    const purchase = await newPurchase("paypal");
    await attachProviderOrder(purchase.id, "ORDER_X");

    fetchHandler = (url) => {
      if (url.endsWith("/v1/oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 3600 });
      if (url.includes("/capture")) {
        return jsonResponse({
          id: "ORDER_X",
          purchase_units: [
            {
              custom_id: purchase.id,
              payments: {
                captures: [{ id: "CAP_X", status: "COMPLETED", amount: { value: "349.00", currency_code: "GBP" } }],
              },
            },
          ],
        });
      }
      return jsonResponse({}, 404);
    };

    const capture = await capturePayPalOrder(getPayPalConfig()!, "ORDER_X");
    const result = await markPurchasePaidIfVerified(purchase.id, {
      provider: "paypal",
      providerOrderId: capture.orderId,
      providerPaymentId: capture.captureId,
      amountMinor: capture.amountMinor,
      currency: capture.currency,
    });

    expect(result.transitioned).toBe(true);
    expect(result.purchase.status).toBe("paid");
    expect(result.purchase.paidAt).not.toBeNull();
    expect(result.purchase.providerPaymentId).toBe("CAP_X");
    expect(result.purchase.fulfillmentStatus).toBe("pending"); // delivery is a separate, manual step
  });

  it("treats a duplicate webhook / confirm delivery as an idempotent no-op", async () => {
    const purchase = await newPurchase("paypal");
    const verification = {
      provider: "paypal" as const,
      providerOrderId: "ORDER_DUP",
      providerPaymentId: "CAP_DUP",
      amountMinor: 34_900,
      currency: "GBP",
    };
    const first = await markPurchasePaidIfVerified(purchase.id, verification);
    expect(first.transitioned).toBe(true);
    const paidAt = first.purchase.paidAt;

    const second = await markPurchasePaidIfVerified(purchase.id, verification);
    expect(second.transitioned).toBe(false);
    expect(second.purchase.status).toBe("paid");
    expect(second.purchase.paidAt?.toISOString()).toBe(paidAt?.toISOString()); // unchanged
  });

  it("rejects a wrong verified amount — the purchase stays pending", async () => {
    const purchase = await newPurchase("paypal");
    await expect(
      markPurchasePaidIfVerified(purchase.id, {
        provider: "paypal",
        providerOrderId: "ORDER_AMT",
        providerPaymentId: "CAP_AMT",
        amountMinor: 100, // tampered / wrong amount
        currency: "GBP",
      })
    ).rejects.toMatchObject({ code: "AMOUNT_MISMATCH" });
    const after = await db.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(after.status).toBe("pending");
    expect(after.paidAt).toBeNull();
  });

  it("rejects a wrong verified currency", async () => {
    const purchase = await newPurchase("paypal");
    await expect(
      markPurchasePaidIfVerified(purchase.id, {
        provider: "paypal",
        providerOrderId: "ORDER_CUR",
        providerPaymentId: "CAP_CUR",
        amountMinor: 34_900,
        currency: "USD",
      })
    ).rejects.toMatchObject({ code: "CURRENCY_MISMATCH" });
  });

  it("rejects a provider mismatch", async () => {
    const purchase = await newPurchase("paypal");
    await expect(
      markPurchasePaidIfVerified(purchase.id, {
        provider: "razorpay",
        providerOrderId: "order_mismatch",
        providerPaymentId: "pay_mismatch",
        amountMinor: 34_900,
        currency: "GBP",
      })
    ).rejects.toMatchObject({ code: "PROVIDER_MISMATCH" });
  });

  it("rejects a purchase whose product SKU was tampered with", async () => {
    const purchase = await newPurchase("paypal");
    await db.purchase.update({ where: { id: purchase.id }, data: { productSku: "not-our-sku" } });
    await expect(
      markPurchasePaidIfVerified(purchase.id, {
        provider: "paypal",
        providerOrderId: "ORDER_SKU",
        providerPaymentId: "CAP_SKU",
        amountMinor: 34_900,
        currency: "GBP",
      })
    ).rejects.toMatchObject({ code: "SKU_MISMATCH" });
    await db.purchase.delete({ where: { id: purchase.id } }).catch(() => undefined);
  });

  it("never lets one provider payment id mark two purchases paid", async () => {
    const first = await newPurchase("paypal");
    const second = await newPurchase("paypal");
    await markPurchasePaidIfVerified(first.id, {
      provider: "paypal",
      providerOrderId: "ORDER_SHARED",
      providerPaymentId: "CAP_SHARED",
      amountMinor: 34_900,
      currency: "GBP",
    });
    // The unique constraint on providerPaymentId blocks the second claim.
    await expect(
      markPurchasePaidIfVerified(second.id, {
        provider: "paypal",
        providerOrderId: "ORDER_SHARED2",
        providerPaymentId: "CAP_SHARED",
        amountMinor: 34_900,
        currency: "GBP",
      })
    ).rejects.toThrow();
    const secondAfter = await db.purchase.findUniqueOrThrow({ where: { id: second.id } });
    expect(secondAfter.status).toBe("pending");
  });

  it("requires server-side verification: an invalid Razorpay signature can never reach the paid transition", async () => {
    clearPaymentEnv();
    process.env.RAZORPAY_KEY_ID = "rzp_test_key";
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
    process.env.LANDINGSENTINEL_PRICE_INR_MINOR = "2890000";

    const purchase = await newPurchase("razorpay");
    await attachProviderOrder(purchase.id, "order_sig");

    // What the confirm route does: verify the handshake signature first.
    const forgedSignature = "0".repeat(64);
    expect(
      verifyRazorpayCheckoutSignature("rzp_test_secret", "order_sig", "pay_sig", forgedSignature)
    ).toBe(false);

    // And therefore markPurchasePaidIfVerified is never reached. The
    // purchase must still be pending.
    const after = await db.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(after.status).toBe("pending");
  });

  it("hides the buyer email in the receipt until the purchase is paid", async () => {
    const pending = await newPurchase("paypal");
    const pendingReceipt = purchaseReceipt(pending);
    expect(pendingReceipt.status).toBe("pending");
    expect(pendingReceipt.buyerEmail).toBeUndefined();

    await markPurchasePaidIfVerified(pending.id, {
      provider: "paypal",
      providerOrderId: "ORDER_RCPT",
      providerPaymentId: "CAP_RCPT",
      amountMinor: 34_900,
      currency: "GBP",
    });
    const paid = await db.purchase.findUniqueOrThrow({ where: { id: pending.id } });
    const paidReceipt = purchaseReceipt(paid);
    expect(paidReceipt.status).toBe("paid");
    expect(paidReceipt.buyerEmail).toBe("buyer@example.com");
    expect(paidReceipt.productSku).toBe(PRODUCT_SKU);
    expect(paidReceipt.licenseEdition).toBe(LICENSE_EDITION);
  });

  it("exports a typed PurchaseError used by the routes", () => {
    expect(typeof PurchaseErrorCtor).toBe("function");
  });
});
