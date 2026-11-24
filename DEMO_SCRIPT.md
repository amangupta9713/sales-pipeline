# 2–3 Minute Walkthrough

1. **Orient the reviewer (15–20 sec):** “This is a table-first pipeline for 50,000 opportunities. The stage strip shows distribution; the table only mounts the visible rows.”
2. **Prioritize work (20–30 sec):** Click **My focus today**, then show that search and owner filters narrow the list. Mention `/` for search and `Esc` to clear.
3. **Show large-result selection (20–30 sec):** Clear filters, select the table header, and point out that the toolbar states the all-matching scope. Exclude one row and run **Move deals**; each deal advances only one stage. For selected Negotiation deals, choose individual rows and apply Won or Lost, including mixed outcomes.
4. **Demonstrate failure recovery (30–40 sec):** Open **Simulate**, set failed saves to 30%, and move a few rows. Show a failed row, retry only failed saves, and use **Undo last change** after a success.
5. **Demonstrate collaboration and conflict safety (25–35 sec):** Select an open deal, set failed saves to 0% and simulated latency high, start a stage change, then use **Edit selected deal** before the save finishes. Show the row conflict alert, latest server stage, and the **Retry move** / **Keep latest** recovery actions. Explain that version mismatches cannot overwrite newer data and that undo uses the same version check.
6. **Show due-date behavior (15–20 sec):** Point out the due-date labels beside Next Step. Toggle **Due today** and distinguish it from **My focus today**, which also includes overdue open deals.
7. **Close on accessibility and limits (15–20 sec):** Show the visible shortcut hints and keyboard focus. Clarify that the API and teammate feed are in-memory simulations, not a real backend or cross-device sync.

Before recording, reload the app to restore the seed data, leave the failure rate at 10% until the failure demo, and verify `npm run build` and `npm test`.
