import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { MockPipelineApi } from "../api/mockPipelineApi";
import type { Deal } from "../domain/deal";
import { useOptimisticStageUpdates } from "./useOptimisticStageUpdates";

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

function renderUpdates(api: MockPipelineApi, initialDeals: Deal[]) {
  return renderHook(() => {
    const [deals, setDeals] = useState(initialDeals);
    return {
      deals,
      updates: useOptimisticStageUpdates({ api, setDeals }),
    };
  });
}

describe("optimistic stage updates", () => {
  it("shows a same-record teammate race as a conflict with the latest server stage", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = makeDeal("one");
    const api = new MockPipelineApi({
      initialDeals: [first],
      settings: { latencyMs: 800, failureRate: 0 },
      random: () => 0,
      sleep: () => gate,
    });
    const { result } = renderUpdates(api, [first]);
    let save!: ReturnType<typeof result.current.updates.saveOne>;

    act(() => {
      save = result.current.updates.saveOne({
        id: "one",
        targetStage: "Won",
        expectedVersion: 1,
      });
    });
    expect(result.current.deals[0]?.stage).toBe("Won");
    expect(result.current.updates.pendingIds.has("one")).toBe(true);

    const teammate = api.simulateTeammateEdit("one")!;
    act(() => result.current.updates.markRemoteUpdates([teammate]));
    expect(result.current.deals[0]?.stage).toBe("Contacted");

    release();
    await act(async () => {
      await save;
    });

    expect(result.current.deals[0]?.stage).toBe("Contacted");
    expect(result.current.deals[0]?.version).toBe(2);
    expect(result.current.updates.feedback.get("one")).toEqual({
      kind: "conflict",
      attemptedStage: "Won",
    });
    expect(result.current.updates.pendingIds.has("one")).toBe(false);
  });

  it("commits successful optimistic writes and restores server data after failures", async () => {
    const first = makeDeal("one");
    const api = new MockPipelineApi({
      initialDeals: [first],
      settings: { latencyMs: 0, failureRate: 0 },
      random: () => 0,
      sleep: noWait,
    });
    const { result, rerender } = renderUpdates(api, [first]);

    await act(async () => {
      await result.current.updates.saveOne({
        id: "one",
        targetStage: "Demo Done",
        expectedVersion: 1,
      });
    });
    expect(result.current.deals[0]?.stage).toBe("Demo Done");
    expect(result.current.deals[0]?.version).toBe(2);
    expect(result.current.updates.feedback.get("one")?.kind).toBe("saved");

    api.setSettings({ failureRate: 1 });
    const latest = api.getRecord("one")!;
    rerender();
    await act(async () => {
      await result.current.updates.saveOne({
        id: "one",
        targetStage: "Won",
        expectedVersion: latest.version,
      });
    });
    expect(result.current.deals[0]?.stage).toBe("Demo Done");
    expect(result.current.updates.feedback.get("one")?.kind).toBe("failed");
  });

  it("keeps other records editable while a bulk batch is pending", async () => {
    const first = makeDeal("one");
    const second = makeDeal("two");
    const api = new MockPipelineApi({
      initialDeals: [first, second],
      settings: { latencyMs: 5, failureRate: 0 },
      random: () => 0,
    });
    const { result } = renderUpdates(api, [first, second]);
    let bulk!: ReturnType<typeof result.current.updates.saveBatch>;
    let single!: ReturnType<typeof result.current.updates.saveOne>;

    act(() => {
      bulk = result.current.updates.saveBatch([
        { id: "one", targetStage: "Won", expectedVersion: 1 },
      ]);
    });
    expect(result.current.updates.pendingIds.has("one")).toBe(true);
    expect(result.current.updates.pendingIds.has("two")).toBe(false);

    act(() => {
      single = result.current.updates.saveOne({
        id: "two",
        targetStage: "Contacted",
        expectedVersion: 1,
      });
    });
    expect(result.current.updates.pendingIds.has("two")).toBe(true);
    expect(result.current.deals.find((deal) => deal.id === "two")?.stage).toBe(
      "Contacted",
    );

    await act(async () => {
      await Promise.all([bulk, single]);
    });

    expect(api.getRecord("one")?.stage).toBe("Won");
    expect(api.getRecord("two")?.stage).toBe("Contacted");
    expect(result.current.updates.pendingIds.size).toBe(0);
  });

  it("does not retry a failed stage move after a teammate advanced past it", async () => {
    const first = makeDeal("one");
    const api = new MockPipelineApi({
      initialDeals: [first],
      settings: { latencyMs: 0, failureRate: 1 },
      random: () => 0,
      sleep: noWait,
    });
    const { result } = renderUpdates(api, [first]);

    await act(async () => {
      await result.current.updates.saveOne({
        id: "one",
        targetStage: "Contacted",
        expectedVersion: 1,
      });
    });
    expect(result.current.updates.feedback.get("one")?.kind).toBe("failed");

    api.simulateTeammateEdit("one");
    const latest = api.simulateTeammateEdit("one")!;
    act(() => result.current.updates.markRemoteUpdates([latest]));
    api.setSettings({ failureRate: 0 });

    await act(async () => {
      await result.current.updates.retryFailed("one");
    });

    expect(api.getRecord("one")?.stage).toBe("Demo Done");
    expect(api.getRecord("one")?.version).toBe(3);
    expect(result.current.deals[0]?.stage).toBe("Demo Done");
    expect(result.current.updates.feedback.has("one")).toBe(false);
  });

  it("does not retry a conflict target that is no longer the immediate next stage", async () => {
    const first = makeDeal("one");
    const api = new MockPipelineApi({
      initialDeals: [first],
      settings: { latencyMs: 0, failureRate: 0 },
      random: () => 0,
      sleep: noWait,
    });
    const { result } = renderUpdates(api, [first]);
    api.simulateTeammateEdit("one");
    const latest = api.simulateTeammateEdit("one")!;
    act(() => result.current.updates.markRemoteUpdates([latest]));

    await act(async () => {
      await result.current.updates.retryConflict("one", "Contacted");
    });

    expect(api.getRecord("one")?.stage).toBe("Demo Done");
    expect(api.getRecord("one")?.version).toBe(3);
    expect(result.current.deals[0]?.stage).toBe("Demo Done");
  });
});
