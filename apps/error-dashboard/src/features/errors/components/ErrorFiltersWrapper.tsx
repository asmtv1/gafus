"use client";

import { CircularProgress, Box } from "@mui/material";
import { Suspense } from "react";

import ErrorFilters from "./ErrorFilters";

export default function ErrorFiltersWrapper() {
  return (
    <Suspense
      fallback={
        <Box display="flex" justifyContent="center" alignItems="center" height={200}>
          <CircularProgress />
        </Box>
      }
    >
      <ErrorFilters />
    </Suspense>
  );
}
