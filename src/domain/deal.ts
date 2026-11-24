export const STAGES = [
  "New Lead",
  "Contacted",
  "Demo Done",
  "Proposal Sent",
  "Negotiation",
  "Won",
  "Lost",
] as const;

export type DealStage = (typeof STAGES)[number];
export type OpenDealStage = Exclude<DealStage, "Won" | "Lost">;

export interface Deal {
  id: string;
  company: string;
  industry: string;
  value: number;
  owner: string;
  initials: string;
  stage: DealStage;
  nextStep: string;
  nextStepDueAt?: string | null;
  lastActivityAt: string;
  version: number;
}

export interface DealFilters {
  query: string;
  stage: DealStage | "All stages";
  owner: string | "All owners";
  focusToday: boolean;
  dueToday: boolean;
}

export const DEFAULT_FILTERS: DealFilters = {
  query: "",
  stage: "All stages",
  owner: "All owners",
  focusToday: false,
  dueToday: false,
};

export interface StageMutationRequest {
  id: string;
  targetStage: DealStage;
  expectedVersion: number;
}

export type StageMutationOutcome =
  | { status: "saved"; deal: Deal; previousStage: DealStage }
  | { status: "conflict"; deal: Deal }
  | { status: "failed"; id: string; error: string };

export const isOpenDeal = (deal: Deal) =>
  deal.stage !== "Won" && deal.stage !== "Lost";

const NEXT_STAGE_OPTIONS: Record<DealStage, readonly DealStage[]> = {
  "New Lead": ["Contacted"],
  Contacted: ["Demo Done"],
  "Demo Done": ["Proposal Sent"],
  "Proposal Sent": ["Negotiation"],
  Negotiation: ["Won", "Lost"],
  Won: [],
  Lost: [],
};

export function getNextStages(stage: DealStage): readonly DealStage[] {
  return NEXT_STAGE_OPTIONS[stage];
}

export function getAvailableStageTargets(
  stage: DealStage,
): readonly DealStage[] {
  const nextStages = getNextStages(stage);
  if (stage === "Won" || stage === "Lost") return [];
  if (nextStages.includes("Lost")) return nextStages;
  return [...nextStages, "Lost"];
}

export function getNextStepLabel(stage: DealStage): string {
  const nextStages = getNextStages(stage);
  return nextStages.length > 0 ? nextStages.join(" / ") : "No next step";
}

export function canAdvanceStage(
  currentStage: DealStage,
  targetStage: DealStage,
): boolean {
  return (
    currentStage !== "Won" &&
    currentStage !== "Lost" &&
    (targetStage === "Lost" || getNextStages(currentStage).includes(targetStage))
  );
}

export function createNextStageBulkPlan(deals: readonly Deal[]): {
  requests: StageMutationRequest[];
  negotiationIds: string[];
  terminalIds: string[];
} {
  const requests: StageMutationRequest[] = [];
  const negotiationIds: string[] = [];
  const terminalIds: string[] = [];

  for (const deal of deals) {
    const nextStages = getNextStages(deal.stage);
    if (deal.stage === "Negotiation") {
      negotiationIds.push(deal.id);
    } else if (nextStages.length === 1) {
      requests.push({
        id: deal.id,
        targetStage: nextStages[0]!,
        expectedVersion: deal.version,
      });
    } else {
      terminalIds.push(deal.id);
    }
  }

  return { requests, negotiationIds, terminalIds };
}

export function getTodayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]!;
}

export function isDueToday(
  dueDate: string | null | undefined,
  today = getTodayKey(),
): boolean {
  return isValidDateKey(dueDate) && isValidDateKey(today) && dueDate === today;
}

export function isDueTodayOrOverdue(
  dueDate: string | null | undefined,
  today = getTodayKey(),
): boolean {
  return isValidDateKey(dueDate) && isValidDateKey(today) && dueDate <= today;
}

export function compareDueDates(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const leftValid = isValidDateKey(left);
  const rightValid = isValidDateKey(right);

  if (leftValid && rightValid) return left.localeCompare(right);
  if (leftValid) return -1;
  if (rightValid) return 1;
  return 0;
}

export function sortDealsByDueDate(
  deals: readonly Deal[],
  direction: "asc" | "desc",
): Deal[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return deals
    .map((deal, index) => ({ deal, index }))
    .sort((left, right) => {
      const leftValid = isValidDateKey(left.deal.nextStepDueAt);
      const rightValid = isValidDateKey(right.deal.nextStepDueAt);
      if (leftValid !== rightValid) return leftValid ? -1 : 1;
      return (
        multiplier *
          compareDueDates(
            left.deal.nextStepDueAt,
            right.deal.nextStepDueAt,
          ) || left.index - right.index
      );
    })
    .map(({ deal }) => deal);
}

export function matchesFilters(
  deal: Deal,
  filters: DealFilters,
  today = getTodayKey(),
): boolean {
  return createDealMatcher(filters, today)(deal);
}

export function createDealMatcher(
  filters: DealFilters,
  today = getTodayKey(),
): (deal: Deal) => boolean {
  const query = filters.query.trim().toLocaleLowerCase();
  return (deal) => {
    if (filters.stage !== "All stages" && deal.stage !== filters.stage) {
      return false;
    }
    if (filters.owner !== "All owners" && deal.owner !== filters.owner) {
      return false;
    }
    if (
      filters.focusToday &&
      (!isOpenDeal(deal) ||
        !isDueTodayOrOverdue(deal.nextStepDueAt, today))
    ) {
      return false;
    }
    if (filters.dueToday && !isDueToday(deal.nextStepDueAt, today)) {
      return false;
    }
    if (!query) return true;
    return [
      deal.company,
      deal.industry,
      deal.owner,
      deal.nextStep,
      getNextStepLabel(deal.stage),
    ]
      .some((value) => value.toLocaleLowerCase().includes(query));
  };
}
