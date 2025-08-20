"use client";

import { createContext, useContext, useState } from "react";

import type { ReactNode } from "react";

interface Filters {
  appName?: string;
  environment?: string;
  resolved?: boolean;
}

interface FilterContextType {
  filters: Filters;
  setFilters: (filters: Filters) => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Filters>({});

  return (
    <FilterContext.Provider value={{ filters, setFilters }}>{children}</FilterContext.Provider>
  );
}

export function useFilters() {
  const context = useContext(FilterContext);
  if (context === undefined) {
    throw new Error("useFilters must be used within a FilterProvider");
  }
  return context;
}
