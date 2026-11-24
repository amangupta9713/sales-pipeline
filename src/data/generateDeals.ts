import { STAGES, getTodayKey, type Deal, type DealStage } from "../domain/deal";

const OWNERS = [
  "Priya Sharma",
  "Jordan Lee",
  "Alex Morgan",
  "Sam Rivera",
  "Taylor Kim",
  "Maya Patel",
  "Chris Nguyen",
  "Avery Brooks",
];

const INDUSTRIES = [
  "Technology",
  "Financial services",
  "Healthcare",
  "Manufacturing",
  "Retail",
  "Professional services",
  "Education",
  "Logistics",
];

const COMPANY_NAMES = [
  "Acme",
  "Northstar",
  "Crestline",
  "Juniper",
  "Meridian",
  "Evergreen",
  "Brightpath",
  "Summit",
  "Pioneer",
  "Bluepeak",
  "Cobalt",
  "Redwood",
];

const NEXT_STEPS = [
  "Share pricing proposal",
  "Confirm stakeholder list",
  "Schedule discovery call",
  "Send security overview",
  "Follow up on demo",
  "Review contract terms",
  "Prepare implementation plan",
  "Connect with finance lead",
];

const STAGE_COUNTS: Partial<Record<DealStage, number>> = {
  "New Lead": 10_000,
  Contacted: 10_000,
  "Demo Done": 10_000,
  "Proposal Sent": 8_000,
  Negotiation: 6_000,
  Won: 4_000,
  Lost: 2_000,
};

const initialsFor = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("");

export function generateDeals(count = 50_000, now = new Date()): Deal[] {
  const stages = STAGES.flatMap((stage) =>
    Array.from({ length: STAGE_COUNTS[stage] ?? 0 }, () => stage),
  );
  const today = getTodayKey(now);
  const baseDay = new Date(`${today}T12:00:00`);

  return Array.from({ length: count }, (_, index) => {
    const owner = OWNERS[index % OWNERS.length];
    const dueOffset = ((index * 7) % 17) - 5;
    const dueDate = new Date(baseDay);
    dueDate.setDate(dueDate.getDate() + dueOffset);
    const activityDate = new Date(baseDay);
    activityDate.setDate(activityDate.getDate() - ((index * 11) % 18));
    const stage = stages[index % stages.length] ?? STAGES[index % STAGES.length];
    const company = `${COMPANY_NAMES[index % COMPANY_NAMES.length]} ${String(index + 1).padStart(5, "0")}`;

    return {
      id: `deal-${String(index + 1).padStart(5, "0")}`,
      company,
      industry: INDUSTRIES[(index * 3) % INDUSTRIES.length],
      value: 25_000 + ((index * 73_123) % 2_400_000),
      owner,
      initials: initialsFor(owner),
      stage,
      nextStep: NEXT_STEPS[(index * 5) % NEXT_STEPS.length],
      nextStepDueAt: getTodayKey(dueDate),
      lastActivityAt: getTodayKey(activityDate),
      version: 1,
    };
  });
}
