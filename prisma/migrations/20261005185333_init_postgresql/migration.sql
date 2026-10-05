-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productName" TEXT NOT NULL DEFAULT 'LandingSentinel',
    "agencyName" TEXT NOT NULL DEFAULT '',
    "logoUrl" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#A7372D',
    "supportEmail" TEXT,
    "website" TEXT,
    "reportFooter" TEXT,
    "reportContactName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT,
    "filename" TEXT NOT NULL,
    "platform" TEXT,
    "currency" TEXT NOT NULL,
    "originalRowCount" INTEGER NOT NULL,
    "validRowCount" INTEGER NOT NULL,
    "rejectedRowCount" INTEGER NOT NULL,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRow" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "platform" TEXT,
    "campaignName" TEXT,
    "adGroupName" TEXT,
    "adName" TEXT,
    "originalUrl" TEXT NOT NULL,
    "spendMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "rawRow" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "representativeUrl" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DestinationCampaign" (
    "id" TEXT NOT NULL,
    "campaignRowId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "spendMinor" INTEGER NOT NULL,

    CONSTRAINT "DestinationCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT,
    "importBatchId" TEXT,
    "label" TEXT,
    "state" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "totalSpendMinor" INTEGER NOT NULL,
    "readinessScore" INTEGER,
    "preflightStatus" TEXT,
    "stats" JSONB,
    "variant" TEXT NOT NULL DEFAULT 'live',
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanTarget" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "finalUrl" TEXT,
    "associatedSpendMinor" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "stage" TEXT,
    "httpStatus" INTEGER,
    "responseTimeMs" INTEGER,
    "contentType" TEXT,
    "bytesInspected" INTEGER,
    "redirectCount" INTEGER,
    "trackerSummary" JSONB,
    "error" JSONB,
    "orderIndex" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ScanTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedirectHop" (
    "id" TEXT NOT NULL,
    "scanTargetId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "fromUrl" TEXT NOT NULL,
    "toUrl" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER,

    CONSTRAINT "RedirectHop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "scanTargetId" TEXT NOT NULL,
    "findingKey" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "recommendation" TEXT,
    "associatedSpendMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "metadata" JSONB,
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branding" JSONB NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanExpectation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "destinationKey" TEXT NOT NULL,
    "expectedTracker" TEXT,
    "expectedText" TEXT,
    "expectedForm" BOOLEAN,
    "expectedHostname" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanExpectation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Client_workspaceId_idx" ON "Client"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Branding_workspaceId_key" ON "Branding"("workspaceId");

-- CreateIndex
CREATE INDEX "ImportBatch_workspaceId_createdAt_idx" ON "ImportBatch"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignRow_importBatchId_idx" ON "CampaignRow"("importBatchId");

-- CreateIndex
CREATE INDEX "Destination_workspaceId_idx" ON "Destination"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Destination_workspaceId_normalizedKey_key" ON "Destination"("workspaceId", "normalizedKey");

-- CreateIndex
CREATE INDEX "DestinationCampaign_destinationId_idx" ON "DestinationCampaign"("destinationId");

-- CreateIndex
CREATE INDEX "DestinationCampaign_campaignRowId_idx" ON "DestinationCampaign"("campaignRowId");

-- CreateIndex
CREATE INDEX "Scan_workspaceId_createdAt_idx" ON "Scan"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ScanTarget_scanId_idx" ON "ScanTarget"("scanId");

-- CreateIndex
CREATE INDEX "ScanTarget_destinationId_idx" ON "ScanTarget"("destinationId");

-- CreateIndex
CREATE INDEX "RedirectHop_scanTargetId_idx" ON "RedirectHop"("scanTargetId");

-- CreateIndex
CREATE INDEX "Finding_scanId_idx" ON "Finding"("scanId");

-- CreateIndex
CREATE INDEX "Finding_scanTargetId_idx" ON "Finding"("scanTargetId");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_scanId_findingKey_key" ON "Finding"("scanId", "findingKey");

-- CreateIndex
CREATE INDEX "Report_scanId_idx" ON "Report"("scanId");

-- CreateIndex
CREATE INDEX "ScanExpectation_workspaceId_idx" ON "ScanExpectation"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ScanExpectation_workspaceId_destinationKey_key" ON "ScanExpectation"("workspaceId", "destinationKey");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branding" ADD CONSTRAINT "Branding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRow" ADD CONSTRAINT "CampaignRow_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinationCampaign" ADD CONSTRAINT "DestinationCampaign_campaignRowId_fkey" FOREIGN KEY ("campaignRowId") REFERENCES "CampaignRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinationCampaign" ADD CONSTRAINT "DestinationCampaign_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanTarget" ADD CONSTRAINT "ScanTarget_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanTarget" ADD CONSTRAINT "ScanTarget_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedirectHop" ADD CONSTRAINT "RedirectHop_scanTargetId_fkey" FOREIGN KEY ("scanTargetId") REFERENCES "ScanTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_scanTargetId_fkey" FOREIGN KEY ("scanTargetId") REFERENCES "ScanTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanExpectation" ADD CONSTRAINT "ScanExpectation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
