import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleHelp,
  Focus,
  Layers3,
  LoaderCircle,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { pipelineApi } from "./api/mockPipelineApi";
import type { SimulationSettings } from "./api/mockPipelineApi";
import { DealTable } from "./components/DealTable";
import { NegotiationResolutionDialog } from "./components/NegotiationResolutionDialog";
import { SimulationPanel } from "./components/SimulationPanel";
import {
  canAdvanceStage,
  createDealMatcher,
  createNextStageBulkPlan,
  DEFAULT_FILTERS,
  getTodayKey,
  isDueTodayOrOverdue,
  isOpenDeal,
  STAGES,
  type Deal,
  type DealFilters,
  type DealStage,
  type StageMutationOutcome,
  type StageMutationRequest,
} from "./domain/deal";
import type { RowFeedback } from "./domain/rowFeedback";
import {
  EMPTY_SELECTION,
  getSelectedIds,
  getSelectionCount,
  isBulkSelectable,
  isSelected,
  selectAllMatching,
  toggleDealSelection,
  type DealSelection,
} from "./domain/selection";
import { useOptimisticStageUpdates } from "./hooks/useOptimisticStageUpdates";

const STAGE_TONES: Record<DealStage, string> = {
  "New Lead": "tone-lead",
  Contacted: "tone-contacted",
  "Demo Done": "tone-demo",
  "Proposal Sent": "tone-proposal",
  Negotiation: "tone-negotiation",
  Won: "tone-won",
  Lost: "tone-lost",
};

const compactMoney = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});
const numberFormat = new Intl.NumberFormat("en-IN");
const BULK_BATCH_SIZE = 1_000;

interface BulkProgress {
  label: string;
  processed: number;
  total: number;
  saved: number;
  failed: number;
  conflicts: number;
}

interface Notice {
  message: string;
  tone: "success" | "warning" | "error";
}

interface NegotiationBulkState {
  ids: string[];
  advanceRequests: StageMutationRequest[];
}

function App() {
  const [deals, setDeals] = useState<Deal[]>(() => pipelineApi.getSnapshot());
  const [filters, setFilters] = useState<DealFilters>(DEFAULT_FILTERS);
  const [selection, setSelection] = useState<DealSelection>(EMPTY_SELECTION);
  const stageUpdates = useOptimisticStageUpdates({
    api: pipelineApi,
    setDeals,
  });
  const {
    feedback,
    pendingIds,
    isTransitionPending,
    saveOne,
    saveBatch,
    retryFailed: retryFailedRecord,
    retryConflict: retryConflictRecord,
    refreshLatest,
    markRemoteUpdates,
  } = stageUpdates;
  const [simulation, setSimulation] = useState<SimulationSettings>(() =>
    pipelineApi.getSettings(),
  );
  const [showSimulation, setShowSimulation] = useState(false);
  const [negotiationBulk, setNegotiationBulk] =
    useState<NegotiationBulkState | null>(null);
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [undoRequests, setUndoRequests] = useState<StageMutationRequest[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef<number | null>(null);

  const filteredDeals = useMemo(
    () => deals.filter(createDealMatcher(filters)),
    [deals, filters],
  );
  const dealById = useMemo(
    () => new Map(deals.map((deal) => [deal.id, deal])),
    [deals],
  );
  const owners = useMemo(
    () => [...new Set(deals.map((deal) => deal.owner))].sort(),
    [deals],
  );
  const stageCounts = useMemo(() => {
    const counts = Object.fromEntries(
      STAGES.map((stage) => [stage, 0]),
    ) as Record<DealStage, number>;
    for (const deal of deals) counts[deal.stage] += 1;
    return counts;
  }, [deals]);
  const metrics = useMemo(() => {
    let activeValue = 0;
    let activeCount = 0;
    let focusCount = 0;
    const today = getTodayKey();
    for (const deal of deals) {
      if (isOpenDeal(deal)) {
        activeValue += deal.value;
        activeCount += 1;
        if (isDueTodayOrOverdue(deal.nextStepDueAt, today)) focusCount += 1;
      }
    }
    return { activeValue, activeCount, focusCount };
  }, [deals]);
  const selectedCount = useMemo(
    () => getSelectionCount(selection, deals),
    [deals, selection],
  );
  const selectedDealForSimulation =
    selection.kind === "explicit" && selection.ids.size === 1
      ? dealById.get([...selection.ids][0]!)
      : undefined;
  const teammateTargetDeal =
    selectedDealForSimulation && isOpenDeal(selectedDealForSimulation)
      ? selectedDealForSimulation
      : undefined;
  const selectedInView = useMemo(
    () =>
      filteredDeals.reduce(
        (count, deal) => count + Number(isSelected(selection, deal)),
        0,
      ),
    [filteredDeals, selection],
  );
  const selectableInView = useMemo(
    () =>
      filteredDeals.reduce(
        (count, deal) => count + Number(isBulkSelectable(deal)),
        0,
      ),
    [filteredDeals],
  );
  const allFilteredSelected =
    selectableInView > 0 && selectedInView === selectableInView;
  const failedItems = useMemo(
    () =>
      [...feedback.entries()].filter(
        (entry): entry is [string, Extract<RowFeedback, { kind: "failed" }>] =>
          entry[1].kind === "failed",
      ),
    [feedback],
  );

  const showNotice = useCallback(
    (message: string, tone: Notice["tone"] = "success") => {
      setNotice({ message, tone });
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setNotice(null), 6_000);
    },
    [],
  );

  useEffect(() => {
    const unsubscribe = pipelineApi.subscribe((changed) => {
      markRemoteUpdates(changed);
    });
    return () => {
      unsubscribe();
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    };
  }, [markRemoteUpdates]);

  useEffect(() => {
    if (!simulation.autoTeammate || !teammateTargetDeal) return;
    const interval = window.setInterval(() => {
      pipelineApi.simulateTeammateEdit(teammateTargetDeal.id);
    }, 8_000);
    return () => window.clearInterval(interval);
  }, [simulation.autoTeammate, teammateTargetDeal?.id]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "a" &&
        !isTyping
      ) {
        event.preventDefault();
        setSelection(selectAllMatching(filters));
      } else if (event.key === "Escape") {
        if (negotiationBulk) {
          setNegotiationBulk(null);
          return;
        }
        if (selectedCount > 0) setSelection(EMPTY_SELECTION);
        else setFilters(DEFAULT_FILTERS);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [filters, negotiationBulk, selectedCount]);

  const changeSimulation = (next: Partial<SimulationSettings>) => {
    setSimulation(pipelineApi.setSettings(next));
  };

  const runBulkRequests = async (
    requests: StageMutationRequest[],
    label: string,
    allowUndo = true,
  ) => {
    if (requests.length === 0 || progress) return;
    const actualRequests = requests.filter(
      (request) => dealById.has(request.id) && !pendingIds.has(request.id),
    );
    if (actualRequests.length === 0) return;
    setProgress({
      label,
      processed: 0,
      total: actualRequests.length,
      saved: 0,
      failed: 0,
      conflicts: 0,
    });

    const totals = { saved: 0, failed: 0, conflicts: 0 };
    const inverses: StageMutationRequest[] = [];

    for (
      let start = 0;
      start < actualRequests.length;
      start += BULK_BATCH_SIZE
    ) {
      const batch = actualRequests.slice(start, start + BULK_BATCH_SIZE);
      const outcomes = await saveBatch(batch, { allowUndo });
      for (const outcome of outcomes) {
        if (outcome.status === "saved") {
          totals.saved += 1;
          inverses.push({
            id: outcome.deal.id,
            targetStage: outcome.previousStage,
            expectedVersion: outcome.deal.version,
          });
        } else if (outcome.status === "conflict") {
          totals.conflicts += 1;
        } else {
          totals.failed += 1;
        }
      }
      setProgress({
        label,
        processed: Math.min(start + batch.length, actualRequests.length),
        total: actualRequests.length,
        ...totals,
      });
    }

    setProgress(null);
    if (allowUndo) setUndoRequests(inverses);
    const summary = `${numberFormat.format(totals.saved)} saved${
      totals.failed ? ` · ${numberFormat.format(totals.failed)} failed` : ""
    }${
      totals.conflicts
        ? ` · ${numberFormat.format(totals.conflicts)} changed by teammates`
        : ""
    }.`;
    showNotice(
      label === "Undo"
        ? `${numberFormat.format(totals.saved)} changes undone${
            totals.conflicts
              ? ` · ${numberFormat.format(totals.conflicts)} could not be undone because they changed`
              : ""
          }.`
        : summary,
      totals.failed || totals.conflicts ? "warning" : "success",
    );
  };

  const saveSingleRequest = useCallback(
    async (
      request: StageMutationRequest,
      allowUndo = true,
    ): Promise<StageMutationOutcome | undefined> => {
      const previous = dealById.get(request.id);
      if (!previous || previous.stage === request.targetStage) return;
      const outcome = await saveOne(request, { allowUndo });
      if (!outcome) return;

      if (outcome.status === "saved") {
        const latest = pipelineApi.getRecord(request.id) ?? outcome.deal;
        if (allowUndo && latest.version === outcome.deal.version) {
          setUndoRequests([
            {
              id: request.id,
              targetStage: outcome.previousStage,
              expectedVersion: outcome.deal.version,
            },
          ]);
        }
        showNotice(
          latest.version > outcome.deal.version
            ? `${previous.company} was saved, then updated by a teammate.`
            : `${previous.company} moved to ${request.targetStage}.`,
          latest.version > outcome.deal.version ? "warning" : "success",
        );
      } else if (outcome.status === "conflict") {
        showNotice(
          `${previous.company} changed while you were editing. The latest stage is shown.`,
          "warning",
        );
      } else {
        showNotice(`${previous.company} was not saved. You can retry it.`, "error");
      }
      return outcome;
    },
    [dealById, saveOne, showNotice],
  );

  const changeOneStage = useCallback(
    (deal: Deal, stage: DealStage) => {
      if (stage === deal.stage) return;
      if (!canAdvanceStage(deal.stage, stage)) {
        showNotice(
          "Deals can only move to their immediate next stage.",
          "warning",
        );
        return;
      }
      void saveSingleRequest({
        id: deal.id,
        targetStage: stage,
        expectedVersion: deal.version,
      });
    },
    [saveSingleRequest, showNotice],
  );

  const applyBulkStage = () => {
    const ids = getSelectedIds(selection, deals);
    const selectedDeals = ids.flatMap((id) => {
      const deal = dealById.get(id);
      return deal ? [deal] : [];
    });
    const pendingCount = selectedDeals.filter((deal) =>
      pendingIds.has(deal.id),
    ).length;
    const plan = createNextStageBulkPlan(
      selectedDeals.filter((deal) => !pendingIds.has(deal.id)),
    );
    const skipped = pendingCount + plan.terminalIds.length;
    setSelection(EMPTY_SELECTION);

    if (plan.negotiationIds.length > 0) {
      setNegotiationBulk({
        ids: plan.negotiationIds,
        advanceRequests: plan.requests,
      });
      if (skipped > 0) {
        showNotice(
          `${numberFormat.format(skipped)} selected deal${skipped === 1 ? "" : "s"} could not advance.`,
          "warning",
        );
      }
      return;
    }

    if (plan.requests.length > 0) {
      void runBulkRequests(plan.requests, "Move deals");
    } else {
      showNotice("No selected deals can move to a later stage.", "warning");
    }
    if (skipped > 0) {
      showNotice(
        `${numberFormat.format(skipped)} selected deal${skipped === 1 ? "" : "s"} could not advance.`,
        "warning",
      );
    }
  };

  const resolveNegotiationBulk = (
    idsToResolve: string[],
    stage: Extract<DealStage, "Won" | "Lost">,
  ) => {
    if (!negotiationBulk || progress) return;

    const selectedIds = new Set(idsToResolve);
    let skipped = 0;
    const negotiationRequests = idsToResolve.flatMap((id) => {
      const deal = dealById.get(id);
      if (
        !deal ||
        deal.stage !== "Negotiation" ||
        pendingIds.has(id)
      ) {
        skipped += 1;
        return [];
      }
      return [{ id, targetStage: stage, expectedVersion: deal.version }];
    });

    const requests = [
      ...negotiationBulk.advanceRequests,
      ...negotiationRequests,
    ];
    const remainingIds = negotiationBulk.ids.filter(
      (id) => !selectedIds.has(id),
    );
    setNegotiationBulk(
      remainingIds.length > 0
        ? { ids: remainingIds, advanceRequests: [] }
        : null,
    );

    if (requests.length > 0) {
      void runBulkRequests(requests, "Move deals");
    } else if (skipped === 0) {
      showNotice("No selected deals can move to that stage.", "warning");
    }
    if (skipped > 0) {
      showNotice(
        `${numberFormat.format(skipped)} selected negotiation deal${skipped === 1 ? "" : "s"} changed or became unavailable.`,
        "warning",
      );
    }
  };

  const retryOne = useCallback(
    (id: string) => {
      const company = pipelineApi.getRecord(id)?.company ?? "This deal";
      void retryFailedRecord(id).then((outcome) => {
        if (outcome?.status === "saved") showNotice(`${company} was saved.`);
        else if (outcome?.status === "conflict") {
          showNotice(
            `${company} changed again. The latest stage is shown.`,
            "warning",
          );
        } else if (outcome?.status === "failed") {
          showNotice(`${company} was not saved. You can retry it.`, "error");
        } else if (!outcome) {
          const latestStage = pipelineApi.getRecord(id)?.stage;
          showNotice(
            `${company} is now at ${latestStage ?? "its latest stage"}; no additional move was made.`,
            "warning",
          );
        }
      });
    },
    [retryFailedRecord, showNotice],
  );

  const retryFailed = async () => {
    if (progress || failedItems.length === 0) return;
    const retryWithoutUndo = failedItems
      .filter(([, row]) => row.allowUndo === false)
      .map(([, row]) => row.request);
    const retryable = failedItems
      .filter(([, row]) => row.allowUndo !== false)
      .map(([, row]) => row.request);
    if (retryWithoutUndo.length > 0) {
      await runBulkRequests(retryWithoutUndo, "Retry failed saves", false);
    }
    if (retryable.length > 0) {
      await runBulkRequests(retryable, "Retry failed saves");
    }
  };

  const retryConflict = useCallback(
    async (id: string, attemptedStage: DealStage) => {
      const company = pipelineApi.getRecord(id)?.company ?? "This deal";
      const outcome = await retryConflictRecord(id, attemptedStage);
      if (outcome?.status === "saved") {
        const latest = pipelineApi.getRecord(id) ?? outcome.deal;
        if (latest.version === outcome.deal.version) {
          setUndoRequests([
            {
              id,
              targetStage: outcome.previousStage,
              expectedVersion: outcome.deal.version,
            },
          ]);
        }
        showNotice(`${company} moved to ${attemptedStage}.`);
      } else if (outcome?.status === "conflict") {
        showNotice(`${company} changed again. The latest stage is shown.`, "warning");
      } else if (outcome?.status === "failed") {
        showNotice(`${company} could not be saved. You can retry the move.`, "error");
      } else if (!outcome) {
        const latestStage = pipelineApi.getRecord(id)?.stage;
        showNotice(
          `${company} is now at ${latestStage ?? "its latest stage"}; no additional move was made.`,
          "warning",
        );
      }
    },
    [retryConflictRecord, showNotice],
  );

  const dismissConflict = useCallback(
    (id: string) => {
      const latest = refreshLatest(id);
      if (latest) showNotice(`Showing the latest stage for ${latest.company}.`);
    },
    [refreshLatest, showNotice],
  );

  const simulateTeammateEdit = useCallback(() => {
    if (!teammateTargetDeal) {
      showNotice("Select exactly one open deal to simulate a teammate edit.", "warning");
      return;
    }
    const changed = pipelineApi.simulateTeammateEdit(teammateTargetDeal.id);
    if (!changed) {
      showNotice("The selected deal is no longer open.", "warning");
      return;
    }
    showNotice(
      `${changed.company} changed to ${changed.stage} by a teammate.${
        pendingIds.has(changed.id)
          ? " Your pending save will now resolve as a conflict."
          : ""
      }`,
      "warning",
    );
  }, [pendingIds, showNotice, teammateTargetDeal]);

  const undoLastChange = () => {
    if (progress || undoRequests.length === 0) return;
    const requests = undoRequests;
    setUndoRequests([]);
    void runBulkRequests(requests, "Undo", false);
  };

  const toggleAllFiltered = useCallback(() => {
    if (allFilteredSelected) setSelection(EMPTY_SELECTION);
    else if (selectableInView > 0) setSelection(selectAllMatching(filters));
  }, [allFilteredSelected, filters, selectableInView]);

  const toggleSelection = useCallback(
    (deal: Deal, checked: boolean) => {
      setSelection((current) => toggleDealSelection(current, deal, checked));
    },
    [],
  );

  const chooseStage = (stage: DealStage) => {
    setFilters((current) => ({
      ...current,
      stage: current.stage === stage ? "All stages" : stage,
    }));
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSelection(EMPTY_SELECTION);
  };

  return (
    <div className="app-shell min-h-screen bg-canvas text-ink">
      <header className="topbar">
        <div className="brand-lockup" aria-label="Sales CRM">
          <span className="brand-mark">
            <Layers3 size={18} strokeWidth={2.2} />
          </span>
          <span className="brand-name">northstar</span>
          <span className="brand-divider" />
          <span className="brand-product">CRM</span>
        </div>
        <div className="topbar-right">
          <span className="sync-status">
            <span className="sync-pulse" />
            Live sync
          </span>
          <span className="avatar-stack" aria-label="Three teammates online">
            <span className="team-avatar team-avatar-violet">PS</span>
            <span className="team-avatar team-avatar-blue">JL</span>
            <span className="team-avatar team-avatar-orange">MK</span>
            <span className="team-count">+4</span>
          </span>
          <button
            className={`button button-secondary simulation-trigger${showSimulation ? " button-active" : ""}`}
            type="button"
            aria-expanded={showSimulation}
            aria-controls="simulation-panel"
            onClick={() => setShowSimulation((current) => !current)}
          >
            <SlidersHorizontal size={15} />
            Simulate
            <span className="simulation-dot" />
          </button>
        </div>
      </header>

      <main className="main-content mx-auto">
        <section className="page-heading">
          <div>
            <div className="breadcrumb">
              <span>Workspace</span>
              <span className="breadcrumb-slash">/</span>
              <span className="breadcrumb-current">Sales pipeline</span>
            </div>
            <h1>Opportunities</h1>
            <p className="page-subtitle">
              Every deal, one clear next step.
              <span className="subtitle-divider">·</span>
              <span>{numberFormat.format(deals.length)} opportunities</span>
            </p>
          </div>
          <div className="heading-actions">
            <button
              className={`button focus-button${filters.focusToday ? " focus-button-active" : ""}`}
              type="button"
              aria-pressed={filters.focusToday}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  focusToday: !current.focusToday,
                }))
              }
            >
              <Focus size={16} />
              My focus today
              <span className="focus-count">{numberFormat.format(metrics.focusCount)}</span>
            </button>
            {undoRequests.length > 0 && (
              <button
                className="button button-secondary undo-button"
                type="button"
                disabled={Boolean(progress)}
                onClick={undoLastChange}
              >
                <Undo2 size={15} />
                Undo last change
              </button>
            )}
          </div>
        </section>

        <SimulationPanel
          open={showSimulation}
          settings={simulation}
          selectedDealName={teammateTargetDeal?.company}
          onSettingsChange={changeSimulation}
          onSimulateTeammate={simulateTeammateEdit}
          onClose={() => setShowSimulation(false)}
        />

        <section className="overview-cards" aria-label="Pipeline overview">
          <article className="overview-card pipeline-value-card">
            <div className="overview-card-top">
              <span className="metric-icon metric-icon-blue">
                <Activity size={17} />
              </span>
              <span className="metric-trend">
                <span className="trend-dot" />
                Active pipeline
              </span>
            </div>
            <strong className="metric-value">{compactMoney.format(metrics.activeValue)}</strong>
            <span className="metric-caption">
              Across {numberFormat.format(metrics.activeCount)} open opportunities
            </span>
          </article>
          <article className="overview-card focus-value-card">
            <div className="overview-card-top">
              <span className="metric-icon metric-icon-amber">
                <Sparkles size={17} />
              </span>
              <span className="metric-caption-strong">Next steps due</span>
            </div>
            <strong className="metric-value">{numberFormat.format(metrics.focusCount)}</strong>
            <span className="metric-caption">Today or overdue · across all stages</span>
          </article>
          <article className="overview-card collaboration-card">
            <div className="overview-card-top">
              <span className="metric-icon metric-icon-green">
                <Users size={17} />
              </span>
              <span className="metric-caption-strong">Team activity</span>
            </div>
            <strong className="team-activity-value">
              <span className="team-activity-indicator" />
              Everyone is in sync
            </strong>
            <span className="metric-caption">Changes appear without losing your place</span>
          </article>
        </section>

        <section className="pipeline-section" aria-label="Pipeline stages">
          <div className="section-heading">
            <div>
              <h2>Pipeline stages</h2>
              <span className="section-subtitle">A snapshot of your deal flow</span>
            </div>
            <span className="pipeline-total">
              {numberFormat.format(deals.length)} total
            </span>
          </div>
          <div className="stage-strip">
            {STAGES.map((stage) => {
              const active = filters.stage === stage;
              return (
                <button
                  type="button"
                  key={stage}
                  className={`stage-summary${active ? " stage-summary-active" : ""}`}
                  aria-pressed={active}
                  onClick={() => chooseStage(stage)}
                >
                  <span className={`stage-summary-dot ${STAGE_TONES[stage]}`} />
                  <span className="stage-summary-name">{stage}</span>
                  <strong>{numberFormat.format(stageCounts[stage])}</strong>
                </button>
              );
            })}
          </div>
        </section>

        <section className="deals-section" aria-label="Opportunity list">
          <div className="deals-heading">
            <div className="deals-title-wrap">
              <h2>All opportunities</h2>
              <span className="deal-count-pill">
                {numberFormat.format(filteredDeals.length)}
              </span>
              <span className="deals-live-hint">
                <span className="live-hint-dot" />
                Live
              </span>
            </div>
            <div className="filter-toolbar">
              <label className="search-field">
                <Search size={16} aria-hidden="true" />
                <span className="sr-only">Search opportunities</span>
                <input
                  ref={searchRef}
                  value={filters.query}
                  placeholder="Search companies, owners..."
                  aria-label="Search companies, owners, or next steps"
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      query: event.target.value,
                    }))
                  }
                />
                <kbd>/</kbd>
              </label>
              <label className="owner-filter">
                <span className="sr-only">Filter by deal owner</span>
                <select
                  value={filters.owner}
                  aria-label="Filter by deal owner"
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      owner: event.target.value,
                    }))
                  }
                >
                  <option value="All owners">All owners</option>
                  {owners.map((owner) => (
                    <option key={owner} value={owner}>
                      {owner}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className={`quick-filter${filters.dueToday ? " quick-filter-active" : ""}`}
                type="button"
                aria-pressed={filters.dueToday}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    dueToday: !current.dueToday,
                  }))
                }
              >
                <Focus size={14} />
                Due today
              </button>
              {(filters.query ||
                filters.stage !== "All stages" ||
                filters.owner !== "All owners" ||
                filters.focusToday ||
                filters.dueToday) && (
                <button
                  className="clear-filter-button"
                  type="button"
                  onClick={resetFilters}
                >
                  <X size={14} />
                  Clear
                </button>
              )}
            </div>
          </div>

          {(selectedCount > 0 || progress || failedItems.length > 0) && (
            <div
              className={`bulk-toolbar${progress ? " bulk-toolbar-progress" : ""}`}
              aria-busy={isTransitionPending}
            >
              {progress ? (
                <>
                  <div className="bulk-progress-copy">
                    <span className="bulk-progress-icon">
                      <LoaderCircle size={16} className="spin" />
                    </span>
                    <span>
                      <strong>{progress.label}</strong>
                      <small>
                        {numberFormat.format(progress.processed)} of{" "}
                        {numberFormat.format(progress.total)} processed
                        {progress.saved > 0 &&
                          ` · ${numberFormat.format(progress.saved)} saved`}
                        {progress.failed > 0 &&
                          ` · ${numberFormat.format(progress.failed)} failed`}
                        {progress.conflicts > 0 &&
                          ` · ${numberFormat.format(progress.conflicts)} conflicts`}
                        {isTransitionPending ? " · Updating visible rows" : ""}
                      </small>
                    </span>
                  </div>
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-label="Bulk update progress"
                    aria-valuenow={progress.processed}
                    aria-valuemin={0}
                    aria-valuemax={progress.total}
                  >
                    <span
                      style={{
                        width: `${(progress.processed / progress.total) * 100}%`,
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  {selectedCount > 0 ? (
                    <div className="selection-summary">
                      <span className="selection-check">
                        <Check size={14} />
                      </span>
                      <strong>{numberFormat.format(selectedCount)} selected</strong>
                      {selection.kind === "allMatching" && (
                        <span className="selection-scope">
                          across all matching opportunities
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="selection-summary">
                      <span className="selection-check selection-alert">
                        <RotateCcw size={13} />
                      </span>
                      <strong>
                        {numberFormat.format(failedItems.length)} saves need attention
                      </strong>
                      <span className="selection-scope">
                        Failed records are unchanged on the server
                      </span>
                    </div>
                  )}
                  <div className="bulk-actions">
                    {failedItems.length > 0 && (
                      <button
                        className="button button-retry"
                        type="button"
                        disabled={Boolean(progress)}
                        onClick={retryFailed}
                      >
                        <RotateCcw size={14} />
                        Retry failed ({numberFormat.format(failedItems.length)})
                      </button>
                    )}
                    {selectedCount > 0 && (
                      <>
                        <button
                          className="button button-primary bulk-apply-button"
                          type="button"
                          disabled={Boolean(progress) || isTransitionPending}
                          onClick={applyBulkStage}
                        >
                          Move deals
                          <ArrowRight size={15} />
                        </button>
                        <button
                          className="icon-button bulk-clear-button"
                          type="button"
                          aria-label="Clear selected deals"
                          onClick={() => setSelection(EMPTY_SELECTION)}
                        >
                          <X size={17} />
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <DealTable
            deals={filteredDeals}
            feedback={feedback}
            pendingIds={pendingIds}
            selection={selection}
            allSelected={allFilteredSelected}
            someSelected={selectedInView > 0}
            onToggleSelection={toggleSelection}
            onToggleAll={toggleAllFiltered}
            onStageChange={changeOneStage}
            onRetry={retryOne}
            onRetryConflict={retryConflict}
            onDismissConflict={dismissConflict}
          />

          <div className="table-footer">
            <span>
              Showing{" "}
              <strong>{numberFormat.format(filteredDeals.length)}</strong> of{" "}
              {numberFormat.format(deals.length)} opportunities
            </span>
            <span className="keyboard-hints">
              <CircleHelp size={14} />
              <kbd>/</kbd> search
              <span className="hint-divider">·</span>
              <kbd>⌘</kbd>/<kbd>Ctrl</kbd> <kbd>A</kbd> select all
              <span className="hint-divider">·</span>
              <kbd>Esc</kbd> clear
            </span>
          </div>
        </section>
      </main>

      {notice && (
        <div
          className={`notice notice-${notice.tone}`}
          role="status"
          aria-live="polite"
        >
          <span className="notice-icon">
            {notice.tone === "success" ? (
              <CheckCircle2 size={17} />
            ) : notice.tone === "warning" ? (
              <Users size={17} />
            ) : (
              <CircleHelp size={17} />
            )}
          </span>
          <span>{notice.message}</span>
          <button
            className="notice-close"
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {negotiationBulk && (
        <NegotiationResolutionDialog
          deals={negotiationBulk.ids.flatMap((id) => {
            const deal = dealById.get(id);
            return deal?.stage === "Negotiation" ? [deal] : [];
          })}
          busy={Boolean(progress) || isTransitionPending}
          hasOtherMoves={negotiationBulk.advanceRequests.length > 0}
          onResolve={resolveNegotiationBulk}
          onClose={() => setNegotiationBulk(null)}
        />
      )}

      <span className="sr-only" aria-live="polite">
        {selectedCount > 0
          ? `${numberFormat.format(selectedCount)} opportunities selected`
          : ""}
      </span>
    </div>
  );
}

export default App;
