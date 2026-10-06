/**
 * Purchase request schemas — shared by the API routes and the test suite.
 *
 * Both schemas are STRICT: unknown fields are rejected. A client can
 * therefore never smuggle `status`, `amountMinor`, `currency`,
 * `productSku` or any other authoritative field into a purchase record —
 * those values are resolved exclusively on the server.
 */

import { z } from "zod";

export const purchaseBuyerSchema = z.strictObject({
  provider: z.enum(["paypal", "razorpay"]),
  buyerName: z.string().trim().min(1).max(120),
  buyerEmail: z.string().trim().email().max(254),
  businessName: z.string().trim().min(1).max(160),
  country: z.string().trim().min(2).max(56),
  website: z.string().trim().max(300).optional(),
  licenceAccepted: z.literal(true),
});

export const purchaseConfirmSchema = z.discriminatedUnion("provider", [
  z.strictObject({
    provider: z.literal("paypal"),
    paypalOrderId: z.string().trim().min(5).max(128),
  }),
  z.strictObject({
    provider: z.literal("razorpay"),
    razorpayOrderId: z.string().trim().min(5).max(128),
    razorpayPaymentId: z.string().trim().min(5).max(128),
    razorpaySignature: z.string().trim().min(16).max(256),
  }),
]);

export type PurchaseBuyerInput = z.infer<typeof purchaseBuyerSchema>;
export type PurchaseConfirmInput = z.infer<typeof purchaseConfirmSchema>;
