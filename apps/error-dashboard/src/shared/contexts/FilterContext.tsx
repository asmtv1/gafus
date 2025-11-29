"use client";

import { createContext, useContext, useState, useEffect } from "react";

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
  // Читаем фильтры из URL при инициализации
  const getInitialFilters = (): Filters => {
    if (typeof window === "undefined") return {};

    const params = new URLSearchParams(window.location.search);
    const filters: Filters = {};

    const app = params.get("app");
    const env = params.get("env");
    const resolved = params.get("resolved");

    if (app) filters.appName = app;
    if (env) filters.environment = env;
    if (resolved === "true") filters.resolved = true;
    if (resolved === "false") filters.resolved = false;

    return filters;
  };

  const [filters, setFilters] = useState<Filters>(getInitialFilters);

  // Слушаем изменения URL (например, при навигации назад/вперед)
  useEffect(() => {
    const handlePopState = () => {
      const newFilters = getInitialFilters();
      // Обновляем только если фильтры действительно изменились
      setFilters((prevFilters) => {
        if (
          prevFilters.appName !== newFilters.appName ||
          prevFilters.environment !== newFilters.environment ||
          prevFilters.resolved !== newFilters.resolved
        ) {
          return newFilters;
        }
        return prevFilters;
      });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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
