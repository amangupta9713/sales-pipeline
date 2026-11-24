# Opportunities Pipeline — Submission Write-up

## What I built

I built a single-screen sales-pipeline workspace for a team managing 50,000 deals. It combines a compact stage summary, a “My focus today” queue, search and owner filters, and a virtualized opportunity table. Users can advance a deal inline or move selected deals forward by one stage, and can mark a deal Lost directly before it reaches a final stage. Negotiation-stage bulk selections open a dialog where checked deals can be split between Won and Lost; Won/Lost deals cannot be bulk-selected.

I chose a table-first experience over a full Kanban board. With up to 10,000 deals in one stage, a board would make scanning, sorting, and selecting across a large result set harder. The stage strip keeps pipeline distribution visible without rendering thousands of cards. The table uses native table semantics and TanStack Virtual so the DOM contains only visible rows and overscan. The value column sorts ascending or descending; due dates stay visible beside each next step and are surfaced through Due today and My Focus Today rather than another header control.

The focus queue and local-calendar Due today filter help users prioritize work. Filter-scoped select-all with exclusions makes selection predictable across virtualized results. One-step stage progression, direct Lost options before a deal is final, and a row-selectable Negotiation dialog for separate Won/Lost outcomes prevent accidental skips. Keyboard support includes `/` to focus search, `Command/Ctrl+A` to select filtered results, `Esc` to clear selection or filters, and Up/Down navigation that scrolls focused opportunities into view; interactive controls have visible focus styles.

## Reliability and collaboration

Saves show an optimistic pending state, then settle as saved, failed, or conflicted. The fake API uses record versions: each mutation must match the version it was based on. A stale mutation returns the newest record instead of overwriting it, and a dedicated row alert offers retrying the intended stage against the latest version or keeping the latest stage. Failed saves restore the latest server value and can be retried; undo is also version-checked so it cannot overwrite a teammate's later edit. The row component is memoized and receives record-scoped pending state, so changes do not disable unrelated rows.

Bulk operations are processed in batches of 1,000 and report progress and per-record outcomes. Only records in the active batch show pending state; unrelated individual updates continue independently while result reconciliation uses a React transition. A failed record is restored to the latest server value and can be retried individually or with the other failed records; successful records are not resubmitted. Teammate updates refresh affected rows without resetting search, selection, or scroll position.

The simulation controls adjust latency from 300–1,500 ms and failure rate from 0–30% (10% by default), trigger a teammate edit, or enable automatic teammate edits every eight seconds. Tests cover fixed calendar-day boundaries, stale writes, near-simultaneous clients, and in-memory subscriber updates. This demonstrates concurrency handling within the fake API, not cross-device synchronization.

Focused tests also cover optimistic rollback and the 50,000-record fixture. Offline and interrupted-request recovery are not currently simulated.

Select-all is represented as a snapshot of the active filters plus an exclusion set, rather than a list of mounted checkboxes. This makes the selection scope explicit and keeps cross-result bulk actions practical. Teammate updates update the shared in-memory store and affected rows without resetting the search, selection, or scroll position. The simulation demonstrates collaboration within one app instance; it is not a real multi-user transport.

## Trade-offs and next steps

The fake API is intentionally in-memory, and the table filters the local fixture. That keeps the take-home runnable without a backend, but a production implementation would move filtering, authorization, idempotency, and selection scopes to a server API. I kept undo version-guarded rather than offering a blind rollback, and chose partial results over failing an entire bulk operation because the team needs to know which deals actually changed.

With more time, I would profile filtering and scrolling on lower-powered devices, add browser-level tests for keyboard and screen-reader flows, and validate long bulk operations with real performance measurements. I would replace the local simulator with a persistent API, server-side query selection, request idempotency, and an event stream for teammate changes. I would also add explicit recovery for offline or interrupted requests; those network conditions are not currently simulated.
