import {
  useCallback,
  useRef,
  useState,
  useTransition,
} from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  Deal,
  StageMutationOutcome,
  StageMutationRequest,
} from "../domain/deal";
import { canAdvanceStage } from "../domain/deal";
import type { RowFeedback } from "../domain/rowFeedback";
import type { MockPipelineApi } from "../api/mockPipelineApi";

type StageUpdateApi = Pick<
  MockPipelineApi,
  "updateStage" | "bulkUpdateStage" | "getRecord"
>;

interface UseOptimisticStageUpdatesOptions {
  api: StageUpdateApi;
  setDeals: Dispatch<SetStateAction<Deal[]>>;
}

interface UpdateOptions {
  allowUndo?: boolean;
}

function upsertIfNewer(current: Deal[], changed: readonly Deal[]): Deal[] {
  const updates = new Map(changed.map((deal) => [deal.id, deal]));
  return current.map((deal) => {
    const update = updates.get(deal.id);
    if (!update || update.version < deal.version) return deal;
    updates.delete(deal.id);
    return update;
  });
}

export function useOptimisticStageUpdates({
  api,
  setDeals,
}: UseOptimisticStageUpdatesOptions) {
  const [feedback, setFeedback] = useState<Map<string, RowFeedback>>(
    () => new Map(),
  );
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [isTransitionPending, startTransition] = useTransition();
  const inFlightRef = useRef(new Set<string>());
  const requestIdRef = useRef(0);
  const activeRequestsRef = useRef(new Map<string, number>());

  const setRowFeedback = useCallback(
    (id: string, value: RowFeedback | null) => {
      setFeedback((current) => {
        const next = new Map(current);
        if (value) next.set(id, value);
        else next.delete(id);
        return next;
      });
    },
    [],
  );

  const markPending = useCallback((ids: readonly string[], pending: boolean) => {
    for (const id of ids) {
      if (pending) inFlightRef.current.add(id);
      else inFlightRef.current.delete(id);
    }
    setPendingIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (pending) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const beginRequests = useCallback(
    (requests: readonly StageMutationRequest[], transition = false) => {
      const eligible = requests.filter(
        (request) => !inFlightRef.current.has(request.id),
      );
      const operationIds = new Map<string, number>();
      for (const request of eligible) {
        const operationId = ++requestIdRef.current;
        operationIds.set(request.id, operationId);
        activeRequestsRef.current.set(request.id, operationId);
      }
      markPending(
        eligible.map((request) => request.id),
        true,
      );
      setFeedback((current) => {
        const next = new Map(current);
        for (const request of eligible) next.set(request.id, { kind: "saving" });
        return next;
      });
      const requestById = new Map(
        eligible.map((request) => [request.id, request]),
      );
      const applyOptimisticChanges = () =>
        setDeals((current) =>
          current.map((deal) => {
            const request = requestById.get(deal.id);
            return request && deal.version === request.expectedVersion
              ? { ...deal, stage: request.targetStage }
              : deal;
          }),
        );
      if (transition) startTransition(applyOptimisticChanges);
      else applyOptimisticChanges();
      return { eligible, operationIds };
    },
    [markPending, setDeals, startTransition],
  );

  const reconcile = useCallback(
    (
      requests: readonly StageMutationRequest[],
      outcomes: readonly StageMutationOutcome[],
      operationIds: ReadonlyMap<string, number>,
      options: UpdateOptions,
      transition: boolean,
    ) => {
      const reconciled: Deal[] = [];
      const feedbackUpdates = new Map<string, RowFeedback>();
      const currentOperations: string[] = [];

      for (let index = 0; index < requests.length; index += 1) {
        const request = requests[index]!;
        const operationId = operationIds.get(request.id);
        if (
          operationId === undefined ||
          activeRequestsRef.current.get(request.id) !== operationId
        ) {
          continue;
        }
        currentOperations.push(request.id);
        const outcome = outcomes[index]!;

        if (outcome.status === "saved") {
          const latest = api.getRecord(request.id) ?? outcome.deal;
          reconciled.push(latest);
          feedbackUpdates.set(
            request.id,
            latest.version > outcome.deal.version
              ? { kind: "remote" }
              : { kind: "saved" },
          );
        } else if (outcome.status === "conflict") {
          reconciled.push(api.getRecord(request.id) ?? outcome.deal);
          feedbackUpdates.set(request.id, {
            kind: "conflict",
            attemptedStage: request.targetStage,
          });
        } else {
          const latest = api.getRecord(request.id);
          if (latest) reconciled.push(latest);
          feedbackUpdates.set(request.id, {
            kind: "failed",
            request,
            message: outcome.error,
            allowUndo: options.allowUndo,
          });
        }
      }

      const applyReconciliation = () => {
        if (reconciled.length > 0) {
          setDeals((current) => upsertIfNewer(current, reconciled));
        }
        if (feedbackUpdates.size > 0) {
          setFeedback((current) => {
            const next = new Map(current);
            for (const [id, value] of feedbackUpdates) next.set(id, value);
            return next;
          });
        }
        markPending(currentOperations, false);
      };

      if (transition) startTransition(applyReconciliation);
      else applyReconciliation();

      for (const id of currentOperations) activeRequestsRef.current.delete(id);

      for (const id of operationIds.keys()) {
        if (feedbackUpdates.get(id)?.kind !== "saved") continue;
        window.setTimeout(() => {
          if (activeRequestsRef.current.has(id)) return;
          setFeedback((current) => {
            if (current.get(id)?.kind !== "saved") return current;
            const next = new Map(current);
            next.delete(id);
            return next;
          });
        }, 2_500);
      }
    },
    [api, markPending, setDeals, startTransition],
  );

  const saveOne = useCallback(
    async (
      request: StageMutationRequest,
      options: UpdateOptions = {},
    ): Promise<StageMutationOutcome | undefined> => {
      const { eligible, operationIds } = beginRequests([request]);
      if (eligible.length === 0) return undefined;
      let outcome: StageMutationOutcome;
      try {
        outcome = await api.updateStage(request);
      } catch (error) {
        outcome = {
          status: "failed",
          id: request.id,
          error:
            error instanceof Error
              ? error.message
              : "The save failed unexpectedly. Please retry.",
        };
      }
      reconcile([request], [outcome], operationIds, options, false);
      return outcome;
    },
    [api, beginRequests, reconcile],
  );

  const saveBatch = useCallback(
    async (
      requests: readonly StageMutationRequest[],
      options: UpdateOptions = {},
    ): Promise<StageMutationOutcome[]> => {
      const { eligible, operationIds } = beginRequests(requests, true);
      if (eligible.length === 0) return [];
      let outcomes: StageMutationOutcome[];
      try {
        outcomes = await api.bulkUpdateStage(eligible);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The request failed unexpectedly. Please retry.";
        outcomes = eligible.map((request) => ({
          status: "failed",
          id: request.id,
          error: message,
        }));
      }
      reconcile(eligible, outcomes, operationIds, options, true);
      return outcomes;
    },
    [api, beginRequests, reconcile],
  );

  const markRemoteUpdates = useCallback(
    (changed: readonly Deal[]) => {
      if (changed.length > 0) {
        setDeals((current) => upsertIfNewer(current, changed));
      }
      setFeedback((current) => {
        const next = new Map(current);
        for (const deal of changed) {
          const existing = next.get(deal.id);
          if (
            existing?.kind === "saving" ||
            existing?.kind === "failed" ||
            existing?.kind === "conflict"
          ) {
            continue;
          }
          next.set(deal.id, { kind: "remote" });
        }
        return next;
      });
      for (const deal of changed) {
        window.setTimeout(() => {
          setFeedback((current) => {
            if (current.get(deal.id)?.kind !== "remote") return current;
            const next = new Map(current);
            next.delete(deal.id);
            return next;
          });
        }, 7_000);
      }
    },
    [setDeals],
  );

  const refreshLatest = useCallback(
    (id: string) => {
      const latest = api.getRecord(id);
      if (latest) setDeals((current) => upsertIfNewer(current, [latest]));
      setRowFeedback(id, null);
      return latest;
    },
    [api, setDeals, setRowFeedback],
  );

  const retryFailed = useCallback(
    async (id: string) => {
      const row = feedback.get(id);
      if (row?.kind !== "failed" || inFlightRef.current.has(id)) return;
      const latest = api.getRecord(id);
      if (!latest) return;
      if (latest.stage === row.request.targetStage) {
        setDeals((current) => upsertIfNewer(current, [latest]));
        setRowFeedback(id, null);
        return;
      }
      if (!canAdvanceStage(latest.stage, row.request.targetStage)) {
        setDeals((current) => upsertIfNewer(current, [latest]));
        setRowFeedback(id, null);
        return;
      }
      return saveOne(
        {
          ...row.request,
          expectedVersion: latest.version,
        },
        { allowUndo: row.allowUndo },
      );
    },
    [api, feedback, saveOne, setDeals, setRowFeedback],
  );

  const retryConflict = useCallback(
    async (id: string, targetStage: StageMutationRequest["targetStage"]) => {
      const latest = api.getRecord(id);
      if (!latest) return;
      if (latest.stage === targetStage) {
        setDeals((current) => upsertIfNewer(current, [latest]));
        setRowFeedback(id, null);
        return;
      }
      if (!canAdvanceStage(latest.stage, targetStage)) {
        setDeals((current) => upsertIfNewer(current, [latest]));
        setRowFeedback(id, null);
        return;
      }
      return saveOne(
        { id, targetStage, expectedVersion: latest.version },
        { allowUndo: true },
      );
    },
    [api, saveOne, setDeals, setRowFeedback],
  );

  return {
    feedback,
    pendingIds,
    isTransitionPending,
    saveOne,
    saveBatch,
    retryFailed,
    retryConflict,
    refreshLatest,
    dismissFeedback: setRowFeedback,
    markRemoteUpdates,
  };
}
