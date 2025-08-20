"use client";

import { CircularProgress, Box } from "@mui/material";
import { useFilters } from "@shared/contexts/FilterContext";
import { Suspense } from "react";

import ErrorListSWRWrapper from "./ErrorListSWRWrapper";

export default function ErrorListWithFilters() {
  const { filters } = useFilters();

  return (
    <Suspense
      fallback={
        <Box display="flex" justifyContent="center" alignItems="center" height={400}>
          <CircularProgress />
        </Box>
      }
    >
      <ErrorListSWRWrapper filters={filters} />
    </Suspense>
  );
}
