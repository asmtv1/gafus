"use client";

import { CircularProgress, Box } from "@mui/material";
import { Suspense } from "react";

import ErrorList from "./ErrorList";

interface ErrorListWrapperProps {
  filters?: {
    appName?: string;
    environment?: string;
  };
}

export default function ErrorListWrapper({ filters = {} }: ErrorListWrapperProps) {
  return (
    <Suspense
      fallback={
        <Box display="flex" justifyContent="center" alignItems="center" height={400}>
          <CircularProgress />
        </Box>
      }
    >
      <ErrorList filters={filters} />
    </Suspense>
  );
}
