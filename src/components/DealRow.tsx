import { memo, useCallback } from "react";
import type { KeyboardEvent } from "react";
import {
  AlertCircle,
  Check,
  Clock3,
  LoaderCircle,
  RotateCcw,
  UsersRound,
} from "lucide-react";
import {
  getAvailableStageTargets,
  getNextStepLabel,
  isValidDateKey,
  type Deal,
  type DealStage,
} from "../domain/deal";
import type { RowFeedback } from "../domain/rowFeedback";
import { isBulkSelectable } from "../domain/selection";

const STAGE_STYLES: Record<DealStage, string> = {
  "New Lead": "stage-lead",
  Contacted: "stage-contacted",
  "Demo Done": "stage-demo",
  "Proposal Sent": "stage-proposal",
  Negotiation: "stage-negotiation",
  Won: "stage-won",
  Lost: "stage-lost",
};

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function dueLabel(dateKey: string | null | undefined): {
  label: string;
  tone: string;
} {
  if (!isValidDateKey(dateKey)) {
    return {
      label: dateKey == null || dateKey === "" ? "No due date" : "Invalid date",
      tone: "due-missing",
    };
  }
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (dateKey === todayKey) return { label: "Today", tone: "due-today" };
  if (dateKey < todayKey) {
    const days =
      Math.round(
        (Date.parse(`${todayKey}T12:00:00`) -
          Date.parse(`${dateKey}T12:00:00`)) /
          86_400_000,
      ) || 1;
    return { label: `${days}d overdue`, tone: "due-overdue" };
  }
  const date = new Date(`${dateKey}T12:00:00`);
  return {
    label: new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "short",
    }).format(date),
    tone: "due-future",
  };
}

function dateLabel(dateKey: string) {
  if (!isValidDateKey(dateKey)) return "—";
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

function DealStatus({ feedback }: { feedback?: RowFeedback }) {
  if (!feedback) {
    return (
      <span className="status-idle">
        <span className="status-dot" />
        Up to date
      </span>
    );
  }

  if (feedback.kind === "saving") {
    return (
      <span className="status-saving" role="status">
        <LoaderCircle size={14} className="spin" />
        Saving
      </span>
    );
  }
  if (feedback.kind === "saved") {
    return (
      <span className="status-saved">
        <Check size={14} />
        Saved
      </span>
    );
  }
  if (feedback.kind === "failed") {
    return (
      <span className="status-failed" title={feedback.message}>
        <AlertCircle size={14} />
        Save failed
      </span>
    );
  }
  if (feedback.kind === "conflict") {
    return (
      <span className="status-conflict">
        <UsersRound size={14} />
        Conflict detected
      </span>
    );
  }
  return (
    <span className="status-remote">
      <UsersRound size={14} />
      Just updated
    </span>
  );
}

export interface DealRowProps {
  deal: Deal;
  feedback?: RowFeedback;
  selected: boolean;
  stagePending: boolean;
  rowIndex: number;
  onToggleSelection: (deal: Deal, checked: boolean) => void;
  onStageChange: (deal: Deal, stage: DealStage) => void;
  onRetry: (id: string) => void;
  onRetryConflict: (id: string, targetStage: DealStage) => void;
  onDismissConflict: (id: string) => void;
  onFocusRow: (index: number) => void;
}

export const DealRow = memo(function DealRow({
  deal,
  feedback,
  selected,
  stagePending,
  rowIndex,
  onToggleSelection,
  onStageChange,
  onRetry,
  onRetryConflict,
  onDismissConflict,
  onFocusRow,
}: DealRowProps) {
  const due = dueLabel(deal.nextStepDueAt);
  const stageTargets = getAvailableStageTargets(deal.stage);
  const stageOptions = [deal.stage, ...stageTargets];
  const nextStepLabel = getNextStepLabel(deal.stage);
  const handleArrowNavigation = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        onFocusRow(rowIndex + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        onFocusRow(rowIndex - 1);
      }
    },
    [onFocusRow, rowIndex],
  );

  return (
    <tr
      className={`deal-row${selected ? " deal-row-selected" : ""}${feedback?.kind === "remote" || feedback?.kind === "conflict" ? " deal-row-updated" : ""}`}
      data-testid={`deal-row-${deal.id}`}
    >
      <td className="select-column">
        <input
          className="checkbox"
          type="checkbox"
          checked={selected}
          disabled={!isBulkSelectable(deal)}
          aria-label={`Select ${deal.company}`}
          onChange={(event) =>
            onToggleSelection(deal, event.target.checked)
          }
        />
      </td>
      <td className="company-cell">
        <div className="company-title-wrap">
          <button
            type="button"
            className="company-name"
            data-row-focus={rowIndex}
            aria-label={`${deal.company}, ${deal.industry}`}
            onKeyDown={handleArrowNavigation}
          >
            {deal.company}
          </button>
          <span className="company-industry">{deal.industry}</span>
        </div>
      </td>
      <td className="value-cell">{money.format(deal.value)}</td>
      <td>
        <label className="sr-only" htmlFor={`stage-${deal.id}`}>
          Stage for {deal.company}
        </label>
        <select
          id={`stage-${deal.id}`}
          className={`stage-select ${STAGE_STYLES[deal.stage]}`}
          value={deal.stage}
          disabled={stagePending || stageTargets.length === 0}
          onChange={(event) =>
            onStageChange(deal, event.target.value as DealStage)
          }
        >
          {stageOptions.map((stage) => (
            <option key={stage} value={stage} disabled={stage === deal.stage}>
              {stage}
            </option>
          ))}
        </select>
      </td>
      <td>
        <span className="owner-cell">
          <span className={`owner-avatar owner-${deal.initials.charCodeAt(0) % 5}`}>
            {deal.initials}
          </span>
          <span>{deal.owner}</span>
        </span>
      </td>
      <td>
        <span className="next-step-cell">
          <Clock3 size={14} />
          <span className="next-step-text">{nextStepLabel}</span>
          <span className={`due-label ${due.tone}`}>{due.label}</span>
        </span>
      </td>
      <td className="activity-cell">{dateLabel(deal.lastActivityAt)}</td>
      <td>
        <div
          className={`save-status-cell${feedback?.kind === "conflict" ? " save-status-conflict" : ""}`}
        >
          <DealStatus feedback={feedback} />
          {feedback?.kind === "failed" && (
            <button
              className="retry-icon-button"
              type="button"
              aria-label={`Retry saving ${deal.company}`}
              title={feedback.message}
              onClick={() => onRetry(deal.id)}
            >
              <RotateCcw size={14} />
            </button>
          )}
          {feedback?.kind === "conflict" && (
            <div className="conflict-actions">
              <span className="conflict-message" role="alert">
                Conflict detected. This record was updated by another user.
                Latest stage: <strong>{deal.stage}</strong>.
              </span>
              <button
                className="conflict-retry-button"
                type="button"
                onClick={() => onRetryConflict(deal.id, feedback.attemptedStage)}
              >
                Retry move to {feedback.attemptedStage}
              </button>
              <button
                className="conflict-dismiss-button"
                type="button"
                onClick={() => onDismissConflict(deal.id)}
              >
                Keep latest
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
});
