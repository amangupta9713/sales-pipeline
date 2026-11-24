import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { X } from "lucide-react";
import type { Deal, DealStage } from "../domain/deal";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export interface NegotiationResolutionDialogProps {
  deals: readonly Deal[];
  busy: boolean;
  hasOtherMoves: boolean;
  onResolve: (ids: string[], stage: Extract<DealStage, "Won" | "Lost">) => void;
  onClose: () => void;
}

export function NegotiationResolutionDialog({
  deals,
  busy,
  hasOtherMoves,
  onResolve,
  onClose,
}: NegotiationResolutionDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const availableIds = useMemo(
    () => new Set(deals.map((deal) => deal.id)),
    [deals],
  );
  const allSelected =
    deals.length > 0 && selectedIds.size === deals.length;
  const isVirtualized = deals.length > 100;
  const virtualizer = useVirtualizer({
    count: isVirtualized ? deals.length : 0,
    getScrollElement: () => listRef.current,
    estimateSize: () => 64,
    initialRect: { width: 640, height: 360 },
    overscan: 8,
  });
  const virtualRows = isVirtualized
    ? virtualizer.getVirtualItems().map((row) => ({
        key: deals[row.index]!.id,
        deal: deals[row.index]!,
        start: row.start,
        size: row.size,
      }))
    : deals.map((deal, index) => ({
        key: deal.id,
        deal,
        start: index * 64,
        size: 64,
      }));
  const listSize = isVirtualized
    ? virtualizer.getTotalSize()
    : deals.length * 64;

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set(
        [...current].filter((id) => availableIds.has(id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [availableIds]);

  const toggleSelection = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(
      checked ? new Set(deals.map((deal) => deal.id)) : new Set(),
    );
  };

  const resolveSelected = (stage: Extract<DealStage, "Won" | "Lost">) => {
    const ids = deals
      .filter((deal) => selectedIds.has(deal.id))
      .map((deal) => deal.id);
    if (ids.length === 0 || busy) return;
    setSelectedIds(new Set());
    onResolve(ids, stage);
  };

  return (
    <div
      className="negotiation-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <section
        className="negotiation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="negotiation-dialog-title"
        aria-describedby="negotiation-dialog-description"
      >
        <header className="negotiation-dialog-header">
          <div>
            <span className="negotiation-dialog-eyebrow">Bulk stage move</span>
            <h2 id="negotiation-dialog-title">Resolve negotiation deals</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button negotiation-dialog-close"
            type="button"
            aria-label="Close negotiation dialog"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <p
          id="negotiation-dialog-description"
          className="negotiation-dialog-description"
        >
          Select the deals to move to Won or Lost. Only checked deals receive
          that outcome.
          {hasOtherMoves &&
            " Other selected deals will advance one stage when you apply your first outcome."}
        </p>

        {deals.length > 0 ? (
          <>
            <label className="negotiation-select-all">
              <input
                className="checkbox"
                type="checkbox"
                checked={allSelected}
                disabled={busy}
                onChange={(event) => toggleAll(event.target.checked)}
              />
              <span>
                Select all negotiation deals
                <small>
                  {selectedIds.size} of {deals.length} selected
                </small>
              </span>
            </label>
            <div
              ref={listRef}
              className="negotiation-dialog-list"
              style={{
                height: Math.min(360, Math.max(80, listSize)),
              }}
            >
              <div
                className="negotiation-dialog-list-content"
                style={{ height: listSize }}
              >
                {virtualRows.map((virtualRow) => {
                  const deal = virtualRow.deal;
                  return (
                    <label
                      key={virtualRow.key}
                      className="negotiation-deal-option"
                      style={{
                        height: virtualRow.size,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <input
                        className="checkbox"
                        type="checkbox"
                        checked={selectedIds.has(deal.id)}
                        disabled={busy}
                        aria-label={`Select ${deal.company} (${deal.id})`}
                        onChange={(event) =>
                          toggleSelection(deal.id, event.target.checked)
                        }
                      />
                      <span className="negotiation-deal-main">
                        <strong>{deal.company}</strong>
                        <small>
                          {deal.industry} · {deal.id}
                        </small>
                      </span>
                      <span className="negotiation-deal-owner">{deal.owner}</span>
                      <strong className="negotiation-deal-value">
                        {money.format(deal.value)}
                      </strong>
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <p className="negotiation-empty">
            These deals are no longer in Negotiation. Close this dialog to see
            their latest stages.
          </p>
        )}

        <footer className="negotiation-dialog-footer">
          <span className="negotiation-selection-count" aria-live="polite">
            {busy ? "Saving selected deals…" : `${selectedIds.size} selected`}
          </span>
          <div className="negotiation-dialog-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={busy || selectedIds.size === 0}
              onClick={() => resolveSelected("Won")}
            >
              Won
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={busy || selectedIds.size === 0}
              onClick={() => resolveSelected("Lost")}
            >
              Lost
            </button>
            <button
              className="button negotiation-dialog-done"
              type="button"
              disabled={busy}
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
