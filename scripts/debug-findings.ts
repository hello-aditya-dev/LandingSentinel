import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const scans = await db.scan.findMany({ orderBy: { startedAt: "desc" } });
  for (const scan of scans.slice(0, 2)) {
    console.log(`\n=== SCAN: ${scan.label} (${scan.variant}) ===`);
    const targets = await db.scanTarget.findMany({
      where: { scanId: scan.id },
      include: { findings: true, destination: true },
    });
    for (const t of targets) {
      const crit = t.findings.filter(f => f.severity === "critical");
      const warn = t.findings.filter(f => f.severity === "warning");
      const info = t.findings.filter(f => f.severity === "info");
      if (crit.length > 0 || warn.length > 0) {
        console.log(`\n${t.destination.normalizedKey}  £${(t.associatedSpendMinor/100).toFixed(0)}`);
        for (const f of [...crit, ...warn]) {
          console.log(`  [${f.severity.toUpperCase()}] ${f.title} (key=${f.findingKey.split("::").slice(1).join("::")})`);
        }
        console.log(`  infos: ${info.map(f => f.title).join(" | ")}`);
      }
    }
    const stats = scan.stats as any;
    console.log(`\nTOTALS: crit_dest=${stats.criticalDestinations} warn_dest=${stats.warningDestinations} healthy=${stats.healthyDestinations} critFind=${stats.criticalFindings} warnFind=${stats.warningFindings} critSpend=£${stats.criticalSpendMinor/100} warnSpend=£${stats.warningSpendMinor/100}`);
  }
}
main().finally(() => db.$disconnect());
