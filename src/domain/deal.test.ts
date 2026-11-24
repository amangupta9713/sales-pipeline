import { describe, expect, it } from "vitest";
import {
  canAdvanceStage,
  compareDueDates,
  createNextStageBulkPlan,
  DEFAULT_FILTERS,
  getAvailableStageTargets,
  getNextStages,
  getNextStepLabel,
  getTodayKey,
  isDueToday,
  isDueTodayOrOverdue,
  isValidDateKey,
  matchesFilters,
  sortDealsByDueDate,
  type Deal,
  type DealStage,
} from "./deal";

const makeDeal = (
  id: string,
  nextStepDueAt: string | null | undefined,
  stage: DealStage = "New Lead",
): Deal => ({
  id,
  company: id,
  industry: "Technology",
  value: 100,
  owner: "Priya Sharma",
  initials: "PS",
  stage,
  nextStep: "Follow up",
  nextStepDueAt,
  lastActivityAt: "2026-11-17",
  version: 1,
});

describe("sequential stage progression", () => {
  it("allows only the immediate next stage and treats Won/Lost as final", () => {
    const progressions: Array<[DealStage, DealStage[]]> = [
      ["New Lead", ["Contacted"]],
      ["Contacted", ["Demo Done"]],
      ["Demo Done", ["Proposal Sent"]],
      ["Proposal Sent", ["Negotiation"]],
      ["Negotiation", ["Won", "Lost"]],
      ["Won", []],
      ["Lost", []],
    ];

    for (const [stage, nextStages] of progressions) {
      expect(getNextStages(stage)).toEqual(nextStages);
      expect(getNextStepLabel(stage)).toBe(
        nextStages.length > 0 ? nextStages.join(" / ") : "No next step",
      );
    }
    expect(canAdvanceStage("New Lead", "Contacted")).toBe(true);
    expect(canAdvanceStage("New Lead", "Demo Done")).toBe(false);
    expect(canAdvanceStage("Negotiation", "Lost")).toBe(true);
    expect(canAdvanceStage("Won", "Lost")).toBe(false);
    expect(canAdvanceStage("Lost", "Contacted")).toBe(false);
  });

  it("offers Lost as a direct close-out option without adding it to Next Step", () => {
    expect(getAvailableStageTargets("New Lead")).toEqual([
      "Contacted",
      "Lost",
    ]);
    expect(getAvailableStageTargets("Proposal Sent")).toEqual([
      "Negotiation",
      "Lost",
    ]);
    expect(getAvailableStageTargets("Negotiation")).toEqual(["Won", "Lost"]);
    expect(getAvailableStageTargets("Won")).toEqual([]);
    expect(getAvailableStageTargets("Lost")).toEqual([]);
    expect(getNextStepLabel("New Lead")).toBe("Contacted");
    expect(getNextStepLabel("Won")).toBe("No next step");
  });

  it("plans bulk moves to each deal's next stage and separates negotiation/final deals", () => {
    const deals = [
      makeDeal("lead", null, "New Lead"),
      makeDeal("contacted", null, "Contacted"),
      makeDeal("demo", null, "Demo Done"),
      makeDeal("proposal", null, "Proposal Sent"),
      makeDeal("negotiation", null, "Negotiation"),
      makeDeal("won", null, "Won"),
      makeDeal("lost", null, "Lost"),
    ];

    expect(createNextStageBulkPlan(deals)).toEqual({
      requests: [
        { id: "lead", targetStage: "Contacted", expectedVersion: 1 },
        { id: "contacted", targetStage: "Demo Done", expectedVersion: 1 },
        { id: "demo", targetStage: "Proposal Sent", expectedVersion: 1 },
        { id: "proposal", targetStage: "Negotiation", expectedVersion: 1 },
      ],
      negotiationIds: ["negotiation"],
      terminalIds: ["won", "lost"],
    });
  });
});

describe("date-only deal behavior", () => {
  it("distinguishes due today from overdue and future work", () => {
    const filters = { ...DEFAULT_FILTERS, dueToday: true };

    expect(
      matchesFilters(makeDeal("today", "2026-11-17"), filters, "2026-11-17"),
    ).toBe(true);
    expect(
      matchesFilters(makeDeal("yesterday", "2026-11-16"), filters, "2026-11-17"),
    ).toBe(false);
    expect(
      matchesFilters(makeDeal("tomorrow", "2026-11-18"), filters, "2026-11-17"),
    ).toBe(false);
    expect(matchesFilters(makeDeal("missing", null), filters, "2026-11-17")).toBe(
      false,
    );
    expect(matchesFilters(makeDeal("absent", undefined), filters, "2026-11-17")).toBe(
      false,
    );
  });

  it("keeps My focus today inclusive of overdue open deals only", () => {
    const filters = { ...DEFAULT_FILTERS, focusToday: true };

    expect(
      matchesFilters(makeDeal("yesterday", "2026-11-16"), filters, "2026-11-17"),
    ).toBe(true);
    expect(
      matchesFilters(makeDeal("tomorrow", "2026-11-18"), filters, "2026-11-17"),
    ).toBe(false);
    expect(
      matchesFilters(
        { ...makeDeal("won", "2026-11-17"), stage: "Won" },
        filters,
        "2026-11-17",
      ),
    ).toBe(false);
  });

  it("compares local calendar keys without timestamp or timezone arithmetic", () => {
    expect(getTodayKey(new Date(2026, 10, 17, 0, 0))).toBe("2026-11-17");
    expect(getTodayKey(new Date(2026, 10, 17, 23, 59))).toBe("2026-11-17");
    expect(isDueToday("2026-11-17", "2026-11-17")).toBe(true);
    expect(isDueToday("2026-11-16", "2026-11-17")).toBe(false);
    expect(isDueTodayOrOverdue("2026-11-16", "2026-11-17")).toBe(true);
  });

  it("validates leap days and places missing or invalid dates last", () => {
    expect(isValidDateKey("2024-02-29")).toBe(true);
    expect(isValidDateKey("2025-02-29")).toBe(false);
    expect(isValidDateKey("2026-2-01")).toBe(false);
    expect(compareDueDates("2026-11-17", undefined)).toBe(-1);
    expect(compareDueDates(undefined, "not-a-date")).toBe(0);
  });

  it("sorts ascending and descending stably without mutating its input", () => {
    const deals = [
      makeDeal("later", "2026-11-18"),
      makeDeal("missing", null),
      makeDeal("first", "2026-11-16"),
      makeDeal("same-day", "2026-11-16"),
      makeDeal("invalid", "yesterday"),
    ];
    const original = [...deals];

    expect(sortDealsByDueDate(deals, "asc").map(({ id }) => id)).toEqual([
      "first",
      "same-day",
      "later",
      "missing",
      "invalid",
    ]);
    expect(sortDealsByDueDate(deals, "desc").map(({ id }) => id)).toEqual([
      "later",
      "first",
      "same-day",
      "missing",
      "invalid",
    ]);
    expect(deals).toEqual(original);
  });
});
