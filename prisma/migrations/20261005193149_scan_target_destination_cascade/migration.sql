-- DropForeignKey
ALTER TABLE "ScanTarget" DROP CONSTRAINT "ScanTarget_destinationId_fkey";

-- AddForeignKey
ALTER TABLE "ScanTarget" ADD CONSTRAINT "ScanTarget_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
