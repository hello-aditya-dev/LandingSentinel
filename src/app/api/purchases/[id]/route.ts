import { ok, fail, route } from "@/lib/api/envelope";
import { getPurchase, purchaseReceipt } from "@/lib/services/purchases";

export const runtime = "nodejs";

/**
 * Purchase receipt — the success page's verification source.
 *
 * The purchase id is an unguessable cuid and acts as the receipt
 * reference. Before the purchase is paid, this endpoint deliberately
 * reveals nothing but the status: buyer identity is only exposed on a
 * server-verified paid record.
 */
export const GET = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const purchase = await getPurchase(id);
  if (!purchase) {
    return fail("NOT_FOUND", "This purchase reference does not exist.", 404);
  }
  return ok(purchaseReceipt(purchase));
});
