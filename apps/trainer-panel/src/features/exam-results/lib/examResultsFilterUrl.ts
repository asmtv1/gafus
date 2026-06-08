interface BuildExamResultsFilterUrlOptions {
  currentSearch: string;
  hideCompleted: boolean;
}

export function buildExamResultsFilterUrl({
  currentSearch,
  hideCompleted,
}: BuildExamResultsFilterUrlOptions): string | null {
  const normalizedCurrentSearch = currentSearch.startsWith("?")
    ? currentSearch.slice(1)
    : currentSearch;
  const params = new URLSearchParams(normalizedCurrentSearch);

  params.set("hideCompleted", String(hideCompleted));

  const nextSearch = params.toString();
  if (nextSearch === normalizedCurrentSearch) {
    return null;
  }

  return nextSearch ? `?${nextSearch}` : null;
}
