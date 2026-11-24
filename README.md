# Northstar CRM — Opportunities

A keyboard-friendly sales pipeline for teams working with 50,000 deals, flaky saves, and changing records. The project is a frontend-only take-home implementation: all data and collaboration are simulated in the browser.

## Run locally

```bash
npm install
npm run dev
```

The dev server prints its local URL. To verify the code:

```bash
npm test
npm run build
```

## Product decisions

- **Table first:** a stage can contain 10,000 deals. A dense table makes search, filtering, sorting, and cross-result bulk selection more useful than mounting thousands of Kanban cards.
- **Virtualized rows:** TanStack Virtual renders only the visible rows plus a small overscan. The data set is deterministic and contains 50,000 deals; New Lead, Contacted, and Demo Done each start with 10,000.
- **Explicit selection scope:** selecting the table header selects all records matching the current filters, represented by the filter snapshot plus excluded IDs. It does not mount every record or retain 50,000 checkbox controls.
- **Feedback before polish:** pending, saved, failed, and teammate-conflict states are visible in the affected rows. Partial bulk results include counts; failed records can be retried without resubmitting successful records.
- **Sequential stage flow:** individual and bulk moves advance only to the immediate next stage, with Lost available as a direct close-out option before a deal reaches a final stage. Negotiation deals are resolved to Won or Lost in a selectable bulk dialog; Won/Lost deals are final and excluded from bulk selection.
- **Date behavior:** due dates remain visible beside each next step, while the top-level **Due today** filter matches the local calendar day exactly. **My focus today** remains open deals due today or overdue.
- **Keyboard:** `/` focuses search, `⌘/Ctrl+A` selects all records matching the current filters, `Esc` clears selection (or resets filters if nothing is selected), and Up/Down moves between opportunity names. Standard form controls remain keyboard-operable.

## Reliability model

`src/api/mockPipelineApi.ts` is the in-memory fake API. A save compares the request's expected version with the latest record version. A mismatch returns the current server record as a conflict; it never silently overwrites it. Single-record changes appear optimistically, then either settle as saved, reconcile to the latest version, or roll back to the server record with a retry action.

Conflicts have a dedicated row alert showing the latest stage, with actions to retry the intended stage against the latest version or keep the latest value. Bulk moves run in batches of 1,000. Each batch incurs the configured latency; individual records can independently fail or conflict, so a partially successful result is possible. Only affected rows show pending state; unrelated rows remain interactive while the bulk response is reconciled in a React transition. The UI reports progress, keeps successes, and retries only failed requests. Undo sends a version-checked reverse mutation, so a teammate's later edit cannot be overwritten by undo.

The **Simulate** panel adjusts latency (300–1,500 ms) and failure rate (0–30%; default 10%), triggers a teammate edit (including a selected deal for a reproducible stale-write race), or enables an automatic teammate edit every 8 seconds. These updates are shared across the current app instance, not across tabs or devices.

## Project structure

- `src/domain/` — typed deals, filter matching, and scalable selection semantics.
- `src/data/` — deterministic 50,000-deal fixture.
- `src/api/` — configurable latency/failure simulator with version checks and subscriptions.
- `src/components/` — virtualized deal table, memoized deal row, and simulation controls.
- `src/hooks/` — version-aware optimistic stage updates and per-record pending state.
- `src/App.tsx` — pipeline screen, optimistic/recovery flows, and keyboard shortcuts.

The UI uses React, TypeScript, Tailwind CSS for design tokens/layout utilities, and a small set of custom component styles for the dense table and interaction states.

## Current limits

- No authentication, persistence, real backend, or true cross-device collaboration, per the assignment brief.
- Filtering and metrics operate on the in-memory fixture. Virtualization limits DOM work; it does not replace server-side querying for a real deployment.
- The tests cover versioned concurrent API writes, subscriber synchronization, optimistic success/rollback, conflict recovery UI, per-record bulk pending behavior, date filtering/sorting, query-scoped selection, focus filtering, and the 50,000-record fixture. A production version should add browser-level accessibility and performance tests.

For the interview write-up and a short recording outline, see [`SUBMISSION_WRITEUP.md`](./SUBMISSION_WRITEUP.md) and [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md).
