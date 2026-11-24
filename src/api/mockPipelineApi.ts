import {
  isOpenDeal,
  type Deal,
  type DealStage,
  type StageMutationOutcome,
  type StageMutationRequest,
} from "../domain/deal";
import { generateDeals } from "../data/generateDeals";

export interface SimulationSettings {
  latencyMs: number;
  failureRate: number;
  autoTeammate: boolean;
}

export interface MockPipelineApiOptions {
  initialDeals?: Deal[];
  settings?: Partial<SimulationSettings>;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

type ChangeSource = "user" | "teammate";
type Listener = (deals: readonly Deal[], source: ChangeSource) => void;

const DEFAULT_SETTINGS: SimulationSettings = {
  latencyMs: 700,
  failureRate: 0.1,
  autoTeammate: false,
};
const OPEN_STAGES = [
  "New Lead",
  "Contacted",
  "Demo Done",
  "Proposal Sent",
  "Negotiation",
] as const;

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class MockPipelineApi {
  private readonly records: Map<string, Deal>;
  private readonly random: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly listeners = new Set<Listener>();
  private settings: SimulationSettings;

  constructor(options: MockPipelineApiOptions = {}) {
    this.records = new Map(
      (options.initialDeals ?? generateDeals()).map((deal) => [deal.id, deal]),
    );
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? delay;
    this.settings = { ...DEFAULT_SETTINGS, ...options.settings };
  }

  getSettings(): SimulationSettings {
    return { ...this.settings };
  }

  setSettings(settings: Partial<SimulationSettings>): SimulationSettings {
    this.settings = { ...this.settings, ...settings };
    return this.getSettings();
  }

  getSnapshot(): Deal[] {
    return [...this.records.values()];
  }

  getRecord(id: string): Deal | undefined {
    return this.records.get(id);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async updateStage(
    request: StageMutationRequest,
  ): Promise<StageMutationOutcome> {
    await this.sleep(this.settings.latencyMs);
    const outcome = this.applyOne(request);
    if (outcome.status === "saved") this.publish([outcome.deal], "user");
    return outcome;
  }

  async bulkUpdateStage(
    requests: readonly StageMutationRequest[],
  ): Promise<StageMutationOutcome[]> {
    await this.sleep(this.settings.latencyMs);
    const changed: Deal[] = [];
    const outcomes = requests.map((request) => {
      const outcome = this.applyOne(request);
      if (outcome.status === "saved") changed.push(outcome.deal);
      return outcome;
    });
    if (changed.length > 0) this.publish(changed, "user");
    return outcomes;
  }

  simulateTeammateEdit(id: string): Deal | null {
    const current = this.records.get(id);
    if (!current || !isOpenDeal(current)) return null;
    const currentIndex = OPEN_STAGES.findIndex(
      (stage) => stage === current.stage,
    );
    const stage: DealStage =
      OPEN_STAGES[(currentIndex + 1) % OPEN_STAGES.length]!;
    const updated: Deal = {
      ...current,
      stage,
      lastActivityAt: new Date().toISOString().slice(0, 10),
      version: current.version + 1,
    };
    this.records.set(updated.id, updated);
    this.publish([updated], "teammate");
    return updated;
  }

  private applyOne(request: StageMutationRequest): StageMutationOutcome {
    const current = this.records.get(request.id);
    if (!current) {
      return {
        status: "failed",
        id: request.id,
        error: "This deal no longer exists.",
      };
    }
    if (current.version !== request.expectedVersion) {
      return { status: "conflict", deal: current };
    }
    if (this.random() < this.settings.failureRate) {
      return {
        status: "failed",
        id: request.id,
        error: "The save did not reach the server. Try again.",
      };
    }

    const updated: Deal = {
      ...current,
      stage: request.targetStage,
      version: current.version + 1,
      lastActivityAt: new Date().toISOString().slice(0, 10),
    };
    this.records.set(updated.id, updated);
    return { status: "saved", deal: updated, previousStage: current.stage };
  }

  private publish(changed: readonly Deal[], source: ChangeSource) {
    for (const listener of this.listeners) listener(changed, source);
  }
}

export const pipelineApi = new MockPipelineApi();
