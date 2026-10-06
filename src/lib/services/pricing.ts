/**
 * Commercial pricing — single source of truth for the checkout.
 *
 * Rules (see DEPLOYMENT.md §payments):
 * - The public GBP price is a fixed integer minor-unit value (£349 = 34900).
 *   It is never recalculated dynamically and never derived from the client.
 * - The India (Razorpay) price is a separately configured fixed INR minor
 *   value — the owner selects the sticker price; no silent exchange-rate
 *   conversion happens anywhere.
 * - All money is integer minor units (see src/lib/money). Display strings
 *   are formatting only — never used in arithmetic or verification.
 */

export const PRODUCT_SKU = "landingsentinel-agency-founding";
export const LICENSE_EDITION = "agency-commercial-2026-10";

export const PRICE_GBP_MINOR_DEFAULT = 34_900;

export type PurchaseCurrency = "GBP" | "INR";

function positiveIntEnv(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Canonical international price in GBP minor units. */
export function priceGbpMinor(): number {
  return positiveIntEnv("LANDINGSENTINEL_PRICE_GBP_MINOR") ?? PRICE_GBP_MINOR_DEFAULT;
}

/** India price in INR minor units, or null when the owner has not set it. */
export function priceInrMinor(): number | null {
  return positiveIntEnv("LANDINGSENTINEL_PRICE_INR_MINOR");
}

/** Format integer minor units for display only (never for arithmetic). */
export function formatMinorForDisplay(minor: number, currency: string): string {
  const symbols: Record<string, string> = { GBP: "£", INR: "₹", USD: "$", EUR: "€" };
  const symbol = symbols[currency] ?? "";
  const major = (minor / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return symbol ? `${symbol}${major}` : `${major} ${currency}`;
}

/**
 * Resolve the server-authoritative price for a provider.
 * PayPal sells the canonical GBP price; Razorpay sells the fixed INR price.
 * Throws when Razorpay is requested without a configured INR price.
 */
export function resolvePurchasePrice(
  provider: "paypal" | "razorpay"
): { amountMinor: number; currency: PurchaseCurrency } {
  if (provider === "paypal") {
    return { amountMinor: priceGbpMinor(), currency: "GBP" };
  }
  const inr = priceInrMinor();
  if (inr === null) {
    throw new PricingError(
      "The India price is not configured on this deployment. Set LANDINGSENTINEL_PRICE_INR_MINOR (see CONFIGURATION.md)."
    );
  }
  return { amountMinor: inr, currency: "INR" };
}

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingError";
  }
}
