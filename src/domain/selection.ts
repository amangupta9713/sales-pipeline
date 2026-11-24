import {
  createDealMatcher,
  isOpenDeal,
  matchesFilters,
  type Deal,
  type DealFilters,
} from "./deal";

export type DealSelection =
  | { kind: "explicit"; ids: ReadonlySet<string> }
  | {
      kind: "allMatching";
      filters: DealFilters;
      excludedIds: ReadonlySet<string>;
    };

export const EMPTY_SELECTION: DealSelection = {
  kind: "explicit",
  ids: new Set<string>(),
};

export const isBulkSelectable = (deal: Deal): boolean => isOpenDeal(deal);

export function isSelected(selection: DealSelection, deal: Deal): boolean {
  if (!isBulkSelectable(deal)) return false;
  return selection.kind === "explicit"
    ? selection.ids.has(deal.id)
    : matchesFilters(deal, selection.filters) &&
        !selection.excludedIds.has(deal.id);
}

export function getSelectionCount(
  selection: DealSelection,
  deals: readonly Deal[],
): number {
  if (selection.kind === "explicit") {
    return deals.reduce(
      (count, deal) =>
        count +
        Number(isBulkSelectable(deal) && selection.ids.has(deal.id)),
      0,
    );
  }
  const matches = createDealMatcher(selection.filters);
  let count = 0;
  for (const deal of deals) {
    if (
      isBulkSelectable(deal) &&
      matches(deal) &&
      !selection.excludedIds.has(deal.id)
    ) {
      count += 1;
    }
  }
  return count;
}

export function getSelectedIds(
  selection: DealSelection,
  deals: readonly Deal[],
): string[] {
  if (selection.kind === "explicit") {
    return deals
      .filter(
        (deal) => isBulkSelectable(deal) && selection.ids.has(deal.id),
      )
      .map((deal) => deal.id);
  }
  const matches = createDealMatcher(selection.filters);
  return deals
    .filter(
      (deal) =>
        isBulkSelectable(deal) &&
        matches(deal) &&
        !selection.excludedIds.has(deal.id),
    )
    .map((deal) => deal.id);
}

export function toggleDealSelection(
  selection: DealSelection,
  deal: Deal,
  checked: boolean,
): DealSelection {
  if (!isBulkSelectable(deal) && checked) return selection;

  if (selection.kind === "explicit") {
    const ids = new Set(selection.ids);
    if (checked) ids.add(deal.id);
    else ids.delete(deal.id);
    return { kind: "explicit", ids };
  }

  const excludedIds = new Set(selection.excludedIds);
  if (checked) excludedIds.delete(deal.id);
  else excludedIds.add(deal.id);
  return { ...selection, excludedIds };
}

export function selectAllMatching(filters: DealFilters): DealSelection {
  return {
    kind: "allMatching",
    filters: { ...filters },
    excludedIds: new Set<string>(),
  };
}
