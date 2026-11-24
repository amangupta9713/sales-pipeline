import { describe, expect, it } from "vitest";
import { generateDeals } from "./generateDeals";

describe("demo dataset", () => {
  it("generates 50,000 deals with 10,000 deals in high-volume stages", () => {
    const deals = generateDeals(50_000, new Date("2026-11-17T12:00:00"));
    const counts = new Map<string, number>();
    for (const deal of deals) {
      counts.set(deal.stage, (counts.get(deal.stage) ?? 0) + 1);
    }

    expect(deals).toHaveLength(50_000);
    expect(counts.get("New Lead")).toBe(10_000);
    expect(counts.get("Contacted")).toBe(10_000);
    expect(counts.get("Won")).toBe(4_000);
  });
});
