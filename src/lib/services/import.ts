/**
 * Import commit: persists a validated import batch, campaign rows,
 * destinations and destination-campaign links.
 *
 * The server ALWAYS re-validates rows before persistence — client-side
 * validation is only a preview convenience.
 */

import { db } from "@/lib/db";
import { PRODUCT } from "@/config/product";
import { parseCsvText, validateRows, dominantPlatform, type Mapping } from "@/lib/csv/parse";
import { normalizeDestinationUrl } from "@/lib/urls/normalize";
import type { WorkspaceContext } from "./context";

export type ImportCommitInput = {
  filename: string;
  csvText: string;
  mapping: Mapping;
  clientId?: string | null;
  demo?: boolean;
};

export type ImportCommitResult =
  | { ok: true; batchId: string; summary: { originalRowCount: number; validRowCount: number; rejectedRowCount: number; destinationCount: number; currency: string; totalSpendMinor: number } }
  | { ok: false; code: "INVALID_IMPORT" | "MIXED_CURRENCY"; message: string; details?: Record<string, unknown> };

export async function commitImport(ctx: WorkspaceContext, input: ImportCommitInput): Promise<ImportCommitResult> {
  const parsed = parseCsvText(input.csvText);
  if (!parsed.ok) {
    return { ok: false, code: "INVALID_IMPORT", message: parsed.reason };
  }
  if (parsed.rows.length > PRODUCT.scanner.maxImportRows) {
    return {
      ok: false,
      code: "INVALID_IMPORT",
      message: `The file contains ${parsed.rows.length.toLocaleString()} rows. The import limit is ${PRODUCT.scanner.maxImportRows.toLocaleString()} rows.`,
    };
  }

  const validation = validateRows(parsed.rows, input.mapping);

  if (validation.currencies.length > 1) {
    return {
      ok: false,
      code: "MIXED_CURRENCY",
      message: "This file contains more than one currency. Choose one currency or split the analysis by currency.",
      details: { currencies: validation.currencies },
    };
  }

  if (validation.valid.length === 0) {
    return {
      ok: false,
      code: "INVALID_IMPORT",
      message: "No valid campaign rows were found. Check the field mapping and the rows flagged for review.",
      details: { rejectedCount: validation.rejected.length },
    };
  }

  if (!input.mapping.url || !input.mapping.spend) {
    return { ok: false, code: "INVALID_IMPORT", message: "Destination URL and spend fields must be mapped." };
  }

  const currency = validation.currency;
  const platform = dominantPlatform(validation.platforms);

  const batch = await db.importBatch.create({
    data: {
      workspaceId: ctx.workspaceId,
      clientId: input.clientId ?? null,
      filename: input.filename.slice(0, 300),
      platform,
      currency,
      originalRowCount: parsed.rows.length,
      validRowCount: validation.valid.length,
      rejectedRowCount: validation.rejected.length,
      demo: input.demo ?? ctx.scanEngine === "demo-fixture",
    },
  });

  // Group valid rows by normalized destination.
  const destinationMap = new Map<
    string,
    { representativeUrl: string; hostname: string; pathname: string; rows: typeof validation.valid }
  >();
  for (const row of validation.valid) {
    const normalized = normalizeDestinationUrl(row.originalUrl);
    if (!normalized.ok) continue;
    const existing = destinationMap.get(normalized.normalizedKey);
    if (existing) {
      existing.rows.push(row);
    } else {
      destinationMap.set(normalized.normalizedKey, {
        representativeUrl: normalized.representativeUrl,
        hostname: normalized.hostname,
        pathname: normalized.pathname,
        rows: [row],
      });
    }
  }

  // Persist rows + destinations + links.
  for (const [normalizedKey, dest] of destinationMap) {
    const destination = await db.destination.upsert({
      where: {
        workspaceId_normalizedKey: {
          workspaceId: ctx.workspaceId,
          normalizedKey,
        },
      },
      create: {
        workspaceId: ctx.workspaceId,
        normalizedKey,
        representativeUrl: dest.representativeUrl,
        hostname: dest.hostname,
        pathname: dest.pathname,
      },
      update: {
        representativeUrl: dest.representativeUrl,
        hostname: dest.hostname,
        pathname: dest.pathname,
      },
    });

    for (const row of dest.rows) {
      const campaignRow = await db.campaignRow.create({
        data: {
          importBatchId: batch.id,
          platform: row.platform,
          campaignName: row.campaignName,
          adGroupName: row.adGroupName,
          adName: row.adName,
          originalUrl: row.originalUrl.slice(0, 2000),
          spendMinor: row.spendMinor,
          currency: row.currency,
          rawRow: row.raw,
        },
      });
      await db.destinationCampaign.create({
        data: {
          campaignRowId: campaignRow.id,
          destinationId: destination.id,
          spendMinor: row.spendMinor,
        },
      });
    }
  }

  return {
    ok: true,
    batchId: batch.id,
    summary: {
      originalRowCount: parsed.rows.length,
      validRowCount: validation.valid.length,
      rejectedRowCount: validation.rejected.length,
      destinationCount: destinationMap.size,
      currency,
      totalSpendMinor: validation.totalSpendMinor,
    },
  };
}
