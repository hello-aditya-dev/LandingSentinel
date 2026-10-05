"use client";

/**
 * Clients view — workspace grouping. V1 ships a single synthetic demo client
 * in demo mode; the data model is workspace/client-ready for production use.
 */

import { useDashboard } from "@/lib/client/queries";
import { Sheet, MicroLabel, DossierLine } from "@/components/paper/paper";
import { Money } from "@/components/paper/evidence";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";

export function ClientsView({ scope }: { scope: "demo" | "app" }) {
  const { data, isLoading } = useDashboard(scope);

  if (isLoading || !data) return <Skeleton className="h-48 rounded-[2px] bg-paper-deep" />;

  const client = data.client;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <MicroLabel>CLIENTS / WORKSPACE</MicroLabel>
        <h1 className="font-display mt-1 text-2xl font-bold leading-tight tracking-tight sm:text-[28px]">Clients</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
          Campaign imports, scans and reports are grouped per client inside this workspace.
        </p>
      </div>

      {client ? (
        <Sheet label="CLIENT / 01" title={client.name} labelAside={<DossierLine items={[`${data.destinationCount} destinations`, `${data.importBatches.length} imports`]} />}>
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3">
              <Users size={18} className="mt-0.5 text-ink-3" aria-hidden="true" />
              <div>
                <p className="text-[13.5px] text-ink-2">
                  {client.name.includes("Synthetic")
                    ? "This client is part of the synthetic demo dataset. No real campaign data exists in this workspace."
                    : "All imports, scans and reports in this workspace belong to this client."}
                </p>
                <DossierLine items={[`ID / ${client.id.slice(-8).toUpperCase()}`]} className="mt-1.5" />
              </div>
            </div>
            <div>
              <MicroLabel>TOTAL IMPORTED SPEND</MicroLabel>
              <Money minor={data.totalImportedSpendMinor} currency={data.importBatches[0]?.currency ?? "GBP"} className="mt-1 block text-lg font-semibold" exact />
            </div>
          </div>
        </Sheet>
      ) : (
        <Sheet label="CLIENTS / EMPTY" title="No clients yet">
          <div className="px-4 py-6 text-[13.5px] text-ink-2 sm:px-5">
            <p>No clients exist in this workspace yet. Import campaign data to create the first client record.</p>
          </div>
        </Sheet>
      )}
    </div>
  );
}
