import { describe, it, expect } from "vitest";
import {
  destinationScore,
  preflightStatus,
  aggregateScanStats,
} from "@/lib/scanner/findings";

describe("finding severity: destination score (deterministic)", () => {
  it("starts at 100 for a destination with no findings", () => {
    expect(destinationScore([])).toBe(100);
  });

  it("subtracts 40 per critical finding (floor 0)", () => {
    expect(destinationScore([{ severity: "critical" }])).toBe(60);
    expect(destinationScore([{ severity: "critical" }, { severity: "critical" }])).toBe(20);
    expect(
      destinationScore([{ severity: "critical" }, { severity: "critical" }, { severity: "critical" }])
    ).toBe(0);
  });

  it("subtracts 12 per warning finding", () => {
    expect(destinationScore([{ severity: "warning" }])).toBe(88);
    expect(destinationScore([{ severity: "warning" }, { severity: "warning" }])).toBe(76);
  });

  it("ignores info findings in scoring", () => {
    expect(destinationScore([{ severity: "info" }, { severity: "info" }])).toBe(100);
  });

  it("combines severities deterministically", () => {
    expect(
      destinationScore([{ severity: "critical" }, { severity: "warning" }, { severity: "info" }])
    ).toBe(48);
  });
});

describe("readiness: preflight status (stamp precedence)", () => {
  it("any confirmed critical → DO NOT LAUNCH", () => {
    expect(preflightStatus([{ severity: "critical" }])).toBe("DO_NOT_LAUNCH");
    expect(preflightStatus([{ severity: "critical" }, { severity: "warning" }, { severity: "info" }])).toBe("DO_NOT_LAUNCH");
  });

  it("warnings only → REVIEW BEFORE LAUNCH", () => {
    expect(preflightStatus([{ severity: "warning" }])).toBe("REVIEW_BEFORE_LAUNCH");
    expect(preflightStatus([{ severity: "warning" }, { severity: "info" }])).toBe("REVIEW_BEFORE_LAUNCH");
  });

  it("no critical/warnings → LAUNCH READY", () => {
    expect(preflightStatus([])).toBe("LAUNCH_READY");
    expect(preflightStatus([{ severity: "info" }, { severity: "info" }])).toBe("LAUNCH_READY");
  });
});

describe("readiness: the status stamp takes precedence over the score", () => {
  it("a single critical finding forces DO_NOT_LAUNCH even at score 60", () => {
    const stats = aggregateScanStats([
      {
        associatedSpendMinor: 100, // the only spend — it carries the whole weight
        findings: [{ severity: "critical" }],
      },
      {
        associatedSpendMinor: 0,
        findings: [],
      },
    ]);
    expect(stats.readinessScore).toBe(60); // spend-weighted: (60*100 + 100*0)/100
    expect(stats.preflightStatus).toBe("DO_NOT_LAUNCH");
  });

  it("a high numerical score never overrides a Critical status", () => {
    // 24 healthy high-spend destinations + one tiny critical destination:
    // the weighted score stays high (97), the stamp must still say DO_NOT LAUNCH.
    const targets: { associatedSpendMinor: number; findings: { severity: string }[] }[] = Array.from(
      { length: 24 },
      () => ({ associatedSpendMinor: 1_000_000, findings: [] as { severity: string }[] })
    );
    targets.push({ associatedSpendMinor: 1_000, findings: [{ severity: "critical" }] });
    const stats = aggregateScanStats(targets);
    expect(stats.readinessScore).toBeGreaterThanOrEqual(95);
    expect(stats.preflightStatus).toBe("DO_NOT_LAUNCH");
  });

  it("warnings only → REVIEW BEFORE LAUNCH regardless of score", () => {
    const stats = aggregateScanStats([
      { associatedSpendMinor: 5_000, findings: [{ severity: "warning" }] },
    ]);
    expect(stats.preflightStatus).toBe("REVIEW_BEFORE_LAUNCH");
    expect(stats.readinessScore).toBe(88);
  });

  it("all healthy → LAUNCH READY with score 100", () => {
    const stats = aggregateScanStats([
      { associatedSpendMinor: 5_000, findings: [] },
      { associatedSpendMinor: 3_000, findings: [{ severity: "info" }] },
    ]);
    expect(stats.preflightStatus).toBe("LAUNCH_READY");
    expect(stats.readinessScore).toBe(100);
  });
});

describe("readiness: spend-weighted aggregation", () => {
  it("weights destination scores by associated spend", () => {
    // £10,000 at score 60 + £30,000 at score 100 → (60*10000 + 100*30000)/40000 = 90
    const stats = aggregateScanStats([
      { associatedSpendMinor: 1_000_000, findings: [{ severity: "critical" }] },
      { associatedSpendMinor: 3_000_000, findings: [] },
    ]);
    expect(stats.readinessScore).toBe(90);
  });

  it("uses equal weights when there is no spend at all", () => {
    const stats = aggregateScanStats([
      { associatedSpendMinor: 0, findings: [{ severity: "critical" }] },
      { associatedSpendMinor: 0, findings: [] },
    ]);
    expect(stats.readinessScore).toBe(80);
  });

  it("rounds to a whole number", () => {
    // (60 * 1 + 100 * 2) / 3 = 86.67 → 87
    const stats = aggregateScanStats([
      { associatedSpendMinor: 100, findings: [{ severity: "critical" }] },
      { associatedSpendMinor: 200, findings: [] },
    ]);
    expect(stats.readinessScore).toBe(87);
  });
});
