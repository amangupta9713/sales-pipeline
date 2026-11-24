import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  matchesFilters,
  type Deal,
  type DealFilters,
} from "./deal";
import {
  getSelectedIds,
  getSelectionCount,
  isSelected,
  selectAllMatching,
  toggleDealSelection,
} from "./selection";

const deals: Deal[] = [
  {
    id: "deal-1",
    company: "Acme Health",
    industry: "Healthcare",
    value: 100_000,
    owner: "Priya Sharma",
    initials: "PS",
    stage: "New Lead",
    nextStep: "Send overview",
    nextStepDueAt: "2026-11-17",
    lastActivityAt: "2026-11-16",
    version: 1,
  },
  {
    id: "deal-2",
    company: "Acme Retail",
    industry: "Retail",
    value: 200_000,
    owner: "Jordan Lee",
    initials: "JL",
    stage: "Contacted",
    nextStep: "Book a call",
    nextStepDueAt: "2026-11-18",
    lastActivityAt: "2026-11-15",
    version: 1,
  },
  {
    id: "deal-3",
    company: "Juniper Labs",
    industry: "Technology",
    value: 300_000,
    owner: "Jordan Lee",
    initials: "JL",
    stage: "Won",
    nextStep: "Share handoff",
    nextStepDueAt: "2026-11-16",
    lastActivityAt: "2026-11-12",
    version: 1,
  },
];

describe("deal filtering and selection", () => {
  it("supports query-scoped select-all without materializing selected IDs", () => {
    const filters: DealFilters = {
      ...DEFAULT_FILTERS,
      query: "acme",
    };
    const selection = selectAllMatching(filters);

    expect(getSelectionCount(selection, deals)).toBe(2);
    expect(getSelectedIds(selection, deals)).toEqual(["deal-1", "deal-2"]);

    const withExclusion = toggleDealSelection(selection, deals[0]!, false);
    expect(getSelectionCount(withExclusion, deals)).toBe(1);
    expect(getSelectedIds(withExclusion, deals)).toEqual(["deal-2"]);
  });

  it("keeps all-matching selection bound to its original filter snapshot", () => {
    const filters: DealFilters = {
      ...DEFAULT_FILTERS,
      stage: "New Lead",
    };
    const selection = selectAllMatching(filters);
    filters.stage = "Won";

    expect(getSelectedIds(selection, deals)).toEqual(["deal-1"]);
  });

  it("excludes Won and Lost deals from row and all-matching selection", () => {
    const lostDeal = { ...deals[2]!, id: "deal-4", stage: "Lost" as const };
    const allDeals = [...deals, lostDeal];
    const selection = selectAllMatching(DEFAULT_FILTERS);

    expect(getSelectionCount(selection, allDeals)).toBe(2);
    expect(getSelectedIds(selection, allDeals)).toEqual(["deal-1", "deal-2"]);
    expect(isSelected(selection, deals[2]!)).toBe(false);
    expect(isSelected(selection, lostDeal)).toBe(false);
    expect(
      getSelectedIds(
        { kind: "explicit", ids: new Set(["deal-3", "deal-4"]) },
        allDeals,
      ),
    ).toEqual([]);
  });

  it("matches today's due work without including closed deals", () => {
    const focusFilters = { ...DEFAULT_FILTERS, focusToday: true };

    expect(matchesFilters(deals[0]!, focusFilters, "2026-11-17")).toBe(true);
    expect(matchesFilters(deals[1]!, focusFilters, "2026-11-17")).toBe(false);
    expect(matchesFilters(deals[2]!, focusFilters, "2026-11-17")).toBe(false);
  });
});
