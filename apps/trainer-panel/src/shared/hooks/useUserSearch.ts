"use client";

import { useSearchData } from "@gafus/react-query";

import { searchUsersByUsername } from "../lib/utils/searchUsersByUsername";

export function useUserSearch(query: string) {
  return useSearchData(
    "user-search",
    (searchQuery: string) => searchUsersByUsername(searchQuery),
    query,
    {
      staleTime: 500, // 500ms дебаунс
    }
  );
}
