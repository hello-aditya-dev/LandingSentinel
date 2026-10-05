import { describe, it, expect } from "vitest";
import { aggregateScanStats } from "@/lib/scanner/findings";

describe("spend exposure: no double counting at the destination level", () => {
  it("£5,000 destination with THREE critical findings still reports £5,000 critical spend — not £15,000", () => {
    const stats = aggregateScanStats([
      {
        associatedSpendMinor: 500_000, // £5,000.00
        findings: [
          { severity: "critical" },
          { severity: "critical" },
          { severity: "critical" },
        ],
      },
    ]);
    expect(stats.criticalFindings).toBe(3);
    expect(stats.criticalDestinations).toBe(1);
    expect(stats.criticalSpendMinor).toBe(500_000); // £5,000 — once
    expect(stats.criticalSpendMinor).not.toBe(1_500_000);
  });

  it("a destination with critical AND warning findings counts only as critical", () => {
    const stats = aggregateScanStats([
      {
        associatedSpendMinor: 250_000,
        findings: [
          { severity: "critical" },
          { severity: "warning" },
          { severity: "warning" },
        ],
      },
    ]);
    expect(stats.criticalDestinations).toBe(1);
    expect(stats.warningDestinations).toBe(0);
    expect(stats.criticalSpendMinor).toBe(250_000);
    expect(stats.warningSpendMinor).toBe(0);
  });

  it("spend sums across DISTINCT destinations with the same severity", () => {
    const stats = aggregateScanStats([
      { associatedSpendMinor: 500_000, findings: [{ severity: "critical" }] },
      { associatedSpendMinor: 250_000, findings: [{ severity: "critical" }] },
    ]);
    expect(stats.criticalDestinations).toBe(2);
    expect(stats.criticalSpendMinor).toBe(750_000);
  });
});

describe("spend exposure: precedence critical > warning > healthy", () => {
  it("each destination lands in exactly one bucket", () => {
    const stats = aggregateScanStats([
      { associatedSpendMinor: 100_000, findings: [{ severity: "critical" }] }, // critical
      { associatedSpendMinor: 200_000, findings: [{ severity: "warning" }] }, // warning
      { associatedSpendMinor: 300_000, findings: [{ severity: "info" }] }, // healthy (info is not a defect)
      { associatedSpendMinor: 400_000, findings: [] }, // healthy
    ]);
    expect(stats.criticalDestinations).toBe(1);
    expect(stats.warningDestinations).toBe(1);
    expect(stats.healthyDestinations).toBe(2);
    expect(stats.criticalSpendMinor).toBe(100_000);
    expect(stats.warningSpendMinor).toBe(200_000);
    expect(stats.healthySpendMinor).toBe(700_000); // info + clean
  });

  it("warning spend never leaks into critical spend", () => {
    const stats = aggregateScanStats([
      { associatedSpendMinor: 999_999, findings: [{ severity: "warning" }, { severity: "warning" }] },
    ]);
    expect(stats.criticalSpendMinor).toBe(0);
    expect(stats.warningSpendMinor).toBe(999_999);
  });

  it("total exposure buckets sum to the total scanned spend", () => {
    const targets = [
      { associatedSpendMinor: 111, findings: [{ severity: "critical" }] },
      { associatedSpendMinor: 222, findings: [{ severity: "critical" }, { severity: "warning" }] },
      { associatedSpendMinor: 333, findings: [{ severity: "warning" }] },
      { associatedSpendMinor: 444, findings: [] },
    ];
    const stats = aggregateScanStats(targets);
    const total = targets.reduce((s, t) => s + t.associatedSpendMinor, 0);
    expect(stats.criticalSpendMinor + stats.warningSpendMinor + stats.healthySpendMinor).toBe(total);
  });
});

describe("spend exposure: counts", () => {
  it("counts findings by severity across destinations", () => {
    const stats = aggregateScanStats([
      {
        associatedSpendMinor: 0,
        findings: [
          { severity: "critical" },
          { severity: "warning" },
          { severity: "info" },
        ],
      },
      {
        associatedSpendMinor: 0,
        findings: [{ severity: "warning" }, { severity: "info" }],
      },
    ]);
    expect(stats.criticalFindings).toBe(1);
    expect(stats.warningFindings).toBe(2);
    expect(stats.infoFindings).toBe(2);
  });

  it("handles an empty scan", () => {
    const stats = aggregateScanStats([]);
    expect(stats.criticalSpendMinor).toBe(0);
    expect(stats.warningSpendMinor).toBe(0);
    expect(stats.healthySpendMinor).toBe(0);
    expect(stats.preflightStatus).toBe("LAUNCH_READY");
    expect(stats.readinessScore).toBe(0); // no destinations — no data
  });
});
