/**
 * PayPal server-side integration (Orders API v2 + webhook verification).
 *
 * Security model (see SECURITY.md / DEPLOYMENT.md):
 * - PAYPAL_CLIENT_SECRET never leaves the server. The browser only ever
 *   receives the PayPal-hosted approval URL.
 * - Orders are created and captured server-side; the browser's redirect is
 *   never treated as proof of payment.
 * - Webhook signatures are verified through PayPal's verification endpoint
 *   before any purchase state changes.
 * - No raw provider payloads are stored; only safe identifiers are logged.
 *
 * The API is called with plain fetch on purpose — no SDK dependency, fully
 * mockable in tests. The access token is cached in-process until shortly
 * before expiry.
 */

export type PayPalEnv = "sandbox" | "live";

export type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  env: PayPalEnv;
  webhookId: string;
  apiBase: string;
};

export class PayPalError extends Error {
  code: "AUTH_FAILED" | "ORDER_FAILED" | "CAPTURE_FAILED" | "INVALID_RESPONSE";
  constructor(code: PayPalError["code"], message: string) {
    super(message);
    this.name = "PayPalError";
    this.code = code;
  }
}

/** Resolved per call (never at module load) so tests can override env. */
export function getPayPalConfig(): PayPalConfig | null {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const env: PayPalEnv = process.env.PAYPAL_ENV?.trim() === "live" ? "live" : "sandbox";
  return {
    clientId,
    clientSecret,
    env,
    webhookId: process.env.PAYPAL_WEBHOOK_ID?.trim() ?? "",
    apiBase: env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com",
  };
}

export function payPalWebhookConfigured(config: PayPalConfig | null): boolean {
  return config !== null && config.webhookId !== "";
}

/* ------------------------------------------------------------------ */
/* Access token                                                        */
/* ------------------------------------------------------------------ */

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

export async function getPayPalAccessToken(config: PayPalConfig): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const res = await fetch(`${config.apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new PayPalError(
      "AUTH_FAILED",
      `PayPal rejected the API credentials (HTTP ${res.status}).`
    );
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new PayPalError("INVALID_RESPONSE", "PayPal returned no access token.");
  }
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + (typeof json.expires_in === "number" ? json.expires_in * 1000 : 0),
  };
  return json.access_token;
}

/** Test hook: clear the in-process token cache. */
export function clearPayPalTokenCache(): void {
  tokenCache = null;
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

/** Integer minor units → PayPal decimal value string ("349.00"). */
export function minorToAmountString(minor: number): string {
  return (minor / 100).toFixed(2);
}

export type CreateOrderInput = {
  purchaseId: string;
  amountMinor: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
};

export type CreatedOrder = { orderId: string; approveUrl: string };

export async function createPayPalOrder(
  config: PayPalConfig,
  input: CreateOrderInput
): Promise<CreatedOrder> {
  const token = await getPayPalAccessToken(config);
  const res = await fetch(`${config.apiBase}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.purchaseId,
          custom_id: input.purchaseId,
          invoice_id: input.purchaseId,
          description: "LandingSentinel Agency Commercial Licence",
          amount: {
            currency_code: input.currency,
            value: minorToAmountString(input.amountMinor),
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "LandingSentinel",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
            user_action: "PAY_NOW",
          },
        },
      },
    }),
  });
  if (!res.ok) {
    throw new PayPalError(
      "ORDER_FAILED",
      `PayPal could not create the order (HTTP ${res.status}).`
    );
  }
  const order = (await res.json()) as {
    id?: string;
    links?: { href?: string; rel?: string }[];
  };
  const approveUrl =
    order.links?.find((l) => l.rel === "payer-action")?.href ??
    order.links?.find((l) => l.rel === "approve")?.href;
  if (!order.id || !approveUrl) {
    throw new PayPalError("INVALID_RESPONSE", "PayPal returned an order without an approval URL.");
  }
  return { orderId: order.id, approveUrl };
}

/* ------------------------------------------------------------------ */
/* Capture                                                             */
/* ------------------------------------------------------------------ */

export type CaptureResult = {
  orderId: string;
  captureId: string;
  /** CAPTURE status from PayPal (COMPLETED, DECLINED, PENDING, …). */
  status: string;
  amountMinor: number;
  currency: string;
  customId: string | null;
};

export async function capturePayPalOrder(
  config: PayPalConfig,
  orderId: string
): Promise<CaptureResult> {
  const token = await getPayPalAccessToken(config);
  const res = await fetch(
    `${config.apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    }
  );
  if (!res.ok) {
    throw new PayPalError(
      "CAPTURE_FAILED",
      `PayPal could not capture the order (HTTP ${res.status}).`
    );
  }
  const order = (await res.json()) as {
    id?: string;
    status?: string;
    purchase_units?: {
      custom_id?: string;
      payments?: { captures?: {
        id?: string;
        status?: string;
        amount?: { value?: string; currency_code?: string };
      }[] };
    }[];
  };
  const unit = order.purchase_units?.[0];
  const capture = unit?.payments?.captures?.find((c) => c.id);
  const value = capture?.amount?.value;
  if (!order.id || !capture?.id || !value || !capture.amount?.currency_code) {
    throw new PayPalError("INVALID_RESPONSE", "PayPal returned an incomplete capture result.");
  }
  const amountMinor = Math.round(Number.parseFloat(value) * 100);
  if (!Number.isFinite(amountMinor)) {
    throw new PayPalError("INVALID_RESPONSE", "PayPal returned a non-numeric capture amount.");
  }
  return {
    orderId: order.id,
    captureId: capture.id,
    status: capture.status ?? order.status ?? "UNKNOWN",
    amountMinor,
    currency: capture.amount.currency_code,
    customId: unit?.custom_id ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Webhook signature verification                                      */
/* ------------------------------------------------------------------ */

/**
 * Verify a webhook notification using PayPal's verification API
 * (transmission headers + webhook id + raw event). Returns false on any
 * failure — an unverifiable webhook is never acted upon.
 */
export async function verifyPayPalWebhookSignature(
  config: PayPalConfig,
  headers: Headers,
  rawBody: string
): Promise<boolean> {
  if (!config.webhookId) return false;
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return false;
  }
  const required = [
    "paypal-auth-algo",
    "paypal-cert-url",
    "paypal-transmission-id",
    "paypal-transmission-sig",
    "paypal-transmission-time",
  ];
  for (const name of required) {
    if (!headers.get(name)) return false;
  }
  try {
    const token = await getPayPalAccessToken(config);
    const res = await fetch(`${config.apiBase}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: config.webhookId,
        webhook_event: event,
      }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { verification_status?: string };
    return json.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}
