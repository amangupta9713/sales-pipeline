import { describe, expect, it } from "vitest";
import { MockPipelineApi } from "./mockPipelineApi";
import type { Deal } from "../domain/deal";

const makeDeal = (id: string): Deal => ({
  id,
  company: `Company ${id}`,
  industry: "Technology",
  value: 100_000,
  owner: "Priya Sharma",
  initials: "PS",
  stage: "New Lead",
  nextStep: "Schedule a call",
  nextStepDueAt: "2026-11-20",
  lastActivityAt: "2026-11-17",
  version: 1,
});

const noWait = async () => Promise.resolve();

describe("mock pipeline API", () => {
  it("detects stale versions instead of overwriting teammate changes", async () => {
    const api = new MockPipelineApi({
      initialDeals: [makeDeal("one")],
      settings: { latencyMs: 0, failureRate: 0 },
      random: () => 0,
      sleep: noWait,
    });

    const teammateChange = api.simulateTeammateEdit("one");
    expect(teammateChange?.version).toBe(2);

    const result = await api.updateStage({
      id: "one",
      targetStage: "Won",
      expectedVersion: 1,
    });

    expect(result.status).toBe("conflict");
    if (result.status === "conflict") {
      expect(result.deal.stage).toBe("Contacted");
      expect(result.deal.version).toBe(2);
    }
  });

  it("publishes a teammate edit to two subscribed clients without reloading", () => {
    const api = new MockPipelineApi({
      initialDeals: [makeDeal("one")],
      settings: { latencyMs: 0, failureRate: 0 },
      random: () => 0,
      sleep: noWait,
    });
    const clientOne: Deal[] = [];
    const clientTwo: Deal[] = [];
    api.subscribe((changed, source) => {
      if (source === "teammate") clientOne.push(...changed);
    });
    api.subscribe((changed, source) => {
      if (source === "teammate") clientTwo.push(...changed);
    });

    const changed = api.simulateTeammateEdit("one");

    expect(changed?.stage).toBe("Contacted");
    expect(clientOne[0]).toEqual(changed);
    expect(clientTwo[0]).toEqual(changed);
    expect(api.getRecord("one")).toEqual(changed);
  });

  it("only updates the explicitly targeted open deal", () => {
    const first = makeDeal("one");
    const second = makeDeal("two");
    const api = new MockPipelineApi({
      initialDeals: [first, second],
      settings: { latencyMs: 0, failureRate: 0 },
      random: () => 0,
      sleep: noWait,
    });

    const changed = api.simulateTeammateEdit("two");

    expect(changed?.id).toBe("two");
    expect(api.getRecord("one")).toEqual(first);
    expect(api.getRecord("two")?.version).toBe(2);
    expect(api.simulateTeammateEdit("missing")).toBeNull();
  });

  it("allows near-simultaneous clients to submit the same version but commits only one", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = new MockPipelineApi({
      initialDeals: [makeDeal("one")],
      settings: { latencyMs: 1, failureRate: 0 },
      random: () => 0,
      sleep: () => gate,
    });

    const clientOne = api.updateStage({
      id: "one",
      targetStage: "Won",
      expectedVersion: 1,
    });
    const clientTwo = api.updateStage({
      id: "one",
      targetStage: "Lost",
      expectedVersion: 1,
    });
    release();
    const outcomes = await Promise.all([clientOne, clientTwo]);

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([
      "conflict",
      "saved",
    ]);
    expect(api.getRecord("one")?.version).toBe(2);
  });

  it("keeps failed saves unchanged and allows an idempotent retry", async () => {
    const api = new MockPipelineApi({
      initialDeals: [makeDeal("one")],
      settings: { latencyMs: 0, failureRate: 1 },
      random: () => 0,
      sleep: noWait,
    });
    const request = {
      id: "one",
      targetStage: "Demo Done" as const,
      expectedVersion: 1,
    };

    const first = await api.updateStage(request);
    expect(first.status).toBe("failed");
    expect(api.getRecord("one")?.version).toBe(1);

    api.setSettings({ failureRate: 0 });
    const retry = await api.updateStage(request);
    expect(retry.status).toBe("saved");
    expect(api.getRecord("one")?.stage).toBe("Demo Done");
    expect(api.getRecord("one")?.version).toBe(2);
  });

  it("returns per-record outcomes for partially successful bulk saves", async () => {
    const randomValues = [0.05, 0.5];
    const api = new MockPipelineApi({
      initialDeals: [makeDeal("one"), makeDeal("two")],
      settings: { latencyMs: 0, failureRate: 0.1 },
      random: () => randomValues.shift() ?? 0.5,
      sleep: noWait,
    });

    const outcomes = await api.bulkUpdateStage([
      { id: "one", targetStage: "Won", expectedVersion: 1 },
      { id: "two", targetStage: "Won", expectedVersion: 1 },
    ]);

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "failed",
      "saved",
    ]);
    expect(api.getRecord("one")?.stage).toBe("New Lead");
    expect(api.getRecord("two")?.stage).toBe("Won");
  });

  it("does not undo a successful save over a later teammate edit", async () => {
    const api = new MockPipelineApi({
      initialDeals: [makeDeal("one")],
      settings: { latencyMs: 0, failureRate: 0 },
      random: () => 0,
      sleep: noWait,
    });
    const save = await api.updateStage({
      id: "one",
      targetStage: "Demo Done",
      expectedVersion: 1,
    });
    expect(save.status).toBe("saved");
    if (save.status !== "saved") return;

    api.simulateTeammateEdit("one");
    const undo = await api.updateStage({
      id: "one",
      targetStage: save.previousStage,
      expectedVersion: save.deal.version,
    });

    expect(undo.status).toBe("conflict");
    expect(api.getRecord("one")?.stage).toBe("Proposal Sent");
    expect(api.getRecord("one")?.version).toBe(3);
  });
});
