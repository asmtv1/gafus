"use client";

import { useSearchData } from "@gafus/swr";

import { searchUsersByUsername } from "../lib/utils/searchUsersByUsername";

export function useUserSearch(query: string) {
  return useSearchData(
    query,
    (searchQuery: string) => searchUsersByUsername(searchQuery),
    500, // 500ms дебаунс
  );
}
