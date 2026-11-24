import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  CalendarDays,
} from "lucide-react";
import {
  type Deal,
  type DealStage,
} from "../domain/deal";
import type { RowFeedback } from "../domain/rowFeedback";
import type { DealSelection } from "../domain/selection";
import { isBulkSelectable, isSelected } from "../domain/selection";
import { DealRow } from "./DealRow";

interface DealTableProps {
  deals: readonly Deal[];
  feedback: ReadonlyMap<string, RowFeedback>;
  pendingIds: ReadonlySet<string>;
  selection: DealSelection;
  allSelected: boolean;
  someSelected: boolean;
  onToggleSelection: (deal: Deal, checked: boolean) => void;
  onToggleAll: () => void;
  onStageChange: (deal: Deal, stage: DealStage) => void;
  onRetry: (id: string) => void;
  onRetryConflict: (id: string, targetStage: DealStage) => void;
  onDismissConflict: (id: string) => void;
}

interface SortState {
  direction: "asc" | "desc";
}

function IndeterminateCheckbox({
  checked,
  indeterminate,
  label,
  onChange,
  disabled,
}: {
  checked: boolean;
  indeterminate: boolean;
  label: string;
  onChange: () => void;
  disabled: boolean;
}) {
  return (
    <input
      ref={(node) => {
        if (node) node.indeterminate = indeterminate;
      }}
      className="checkbox"
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={onChange}
    />
  );
}

function SortButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortState["direction"];
  onClick: () => void;
}) {
  return (
    <button
      className="sort-button"
      type="button"
      aria-label={`Sort by ${label} ${
        active && direction === "asc" ? "descending" : "ascending"
      }`}
      onClick={onClick}
    >
      {label}
      {!active ? (
        <ArrowDownUp size={13} />
      ) : direction === "asc" ? (
        <ArrowUp size={13} />
      ) : (
        <ArrowDown size={13} />
      )}
    </button>
  );
}

export function DealTable({
  deals,
  feedback,
  pendingIds,
  selection,
  allSelected,
  someSelected,
  onToggleSelection,
  onToggleAll,
  onStageChange,
  onRetry,
  onRetryConflict,
  onDismissConflict,
}: DealTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<SortState>({
    direction: "asc",
  });
  const sortedDeals = useMemo(
    () =>
      deals
        .map((deal, index) => ({ deal, index }))
        .sort((left, right) => {
          return (
            (sort.direction === "asc" ? 1 : -1) *
              (left.deal.value - right.deal.value) ||
            left.index - right.index
          );
        })
        .map(({ deal }) => deal),
    [deals, sort],
  );
  const virtualizer = useVirtualizer({
    count: sortedDeals.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 68,
    overscan: 10,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const topPadding = virtualRows[0]?.start ?? 0;
  const bottomPadding =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1]!.end
      : 0;

  const focusRow = useCallback(
    (index: number) => {
      if (index < 0 || index >= sortedDeals.length) return;
      virtualizer.scrollToIndex(index, { align: "auto" });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document
            .querySelector<HTMLButtonElement>(`[data-row-focus="${index}"]`)
            ?.focus();
        });
      });
    },
    [sortedDeals.length, virtualizer],
  );

  const toggleSort = useCallback(() => {
    setSort((current) => ({
      direction: current.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  return (
    <div className="table-scroll" ref={scrollRef}>
      <table className="deals-table">
        <caption className="sr-only">
          Sales opportunities with stage, value, owner, and next-step details.
        </caption>
        <thead>
          <tr>
            <th className="select-column">
              <IndeterminateCheckbox
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                label={allSelected ? "Clear selection" : "Select all matching deals"}
                onChange={onToggleAll}
                disabled={!deals.some(isBulkSelectable)}
              />
            </th>
            <th scope="col">Opportunity</th>
            <th scope="col" className="value-heading">
              <SortButton
                label="deal value"
                active
                direction={sort.direction}
                onClick={toggleSort}
              />
            </th>
            <th scope="col">Stage</th>
            <th scope="col">Deal owner</th>
            <th scope="col">Next step</th>
            <th scope="col">Last activity</th>
            <th scope="col">Save status</th>
          </tr>
        </thead>
        <tbody>
          {topPadding > 0 && (
            <tr aria-hidden="true">
              <td
                className="virtual-spacer"
                colSpan={8}
                style={{ height: topPadding }}
              />
            </tr>
          )}
          {virtualRows.map((virtualRow) => {
            const deal = sortedDeals[virtualRow.index]!;
            return (
              <DealRow
                key={deal.id}
                deal={deal}
                feedback={feedback.get(deal.id)}
                selected={isSelected(selection, deal)}
                stagePending={pendingIds.has(deal.id)}
                rowIndex={virtualRow.index}
                onToggleSelection={onToggleSelection}
                onStageChange={onStageChange}
                onRetry={onRetry}
                onRetryConflict={onRetryConflict}
                onDismissConflict={onDismissConflict}
                onFocusRow={focusRow}
              />
            );
          })}
          {bottomPadding > 0 && (
            <tr aria-hidden="true">
              <td
                className="virtual-spacer"
                colSpan={8}
                style={{ height: bottomPadding }}
              />
            </tr>
          )}
        </tbody>
      </table>
      {sortedDeals.length === 0 && (
        <div className="empty-table">
          <span className="empty-table-icon">
            <CalendarDays size={19} />
          </span>
          <strong>No opportunities match these filters</strong>
          <span>Try a different search or clear a filter to see more deals.</span>
        </div>
      )}
    </div>
  );
}
