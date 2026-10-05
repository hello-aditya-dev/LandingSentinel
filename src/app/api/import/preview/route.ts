import { z } from "zod";
import { ok, fail, route } from "@/lib/api/envelope";
import { parseCsvText, detectMapping, validateRows } from "@/lib/csv/parse";
import { PRODUCT } from "@/config/product";
import { resolveContext } from "@/lib/services/context";
import { requireAdminFor } from "@/lib/auth";

export const runtime = "nodejs";

const previewSchema = z.object({
  csvText: z.string().max(4 * 1024 * 1024),
  filename: z.string().max(300).default("campaign-export.csv"),
});

/**
 * Parse and validate a CSV WITHOUT persisting anything.
 * The client uses this for the mapping preview; the final POST /api/import
 * re-validates server-side regardless (never trust client validation).
 */
export const POST = route(async (req) => {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "demo" ? "demo" : "app";
  const ctx = await resolveContext(scope);
  const denied = await requireAdminFor(ctx, req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return fail("INVALID_INPUT", "The request is not valid.", 400);
  }

  const csv = parseCsvText(parsed.data.csvText);
  if (!csv.ok) {
    return fail("INVALID_IMPORT", csv.reason, 400);
  }
  if (csv.rows.length > PRODUCT.scanner.maxImportRows) {
    return fail(
      "INVALID_IMPORT",
      `The file contains ${csv.rows.length.toLocaleString()} rows. The import limit is ${PRODUCT.scanner.maxImportRows.toLocaleString()} rows.`,
      400
    );
  }

  const suggestions = detectMapping(csv.headers);

  // Validate with the suggested mapping so the preview shows real numbers.
  const suggestedMapping: Record<string, string> = {};
  for (const s of suggestions) {
    if (s.confidence === "exact" && s.header) suggestedMapping[s.role] = s.header;
  }
  const validation = validateRows(csv.rows, suggestedMapping);

  return ok({
    filename: parsed.data.filename,
    headers: csv.headers,
    rowCount: csv.rows.length,
    suggestions,
    sampleRows: csv.rows.slice(0, 8),
    currencies: validation.currencies,
    platforms: validation.platforms,
    estimatedValid: validation.valid.length,
    estimatedRejected: validation.rejected.length,
    rejectedPreview: validation.rejected.slice(0, 10).map((r) => ({
      index: r.index,
      code: r.code,
      reason: r.reason,
      raw: r.raw,
    })),
  });
});
