"use client";

import { CircularProgress, Box } from "@mui/material";
import { Suspense } from "react";

import ErrorListSWR from "./ErrorListSWR";

interface ErrorListSWRWrapperProps {
  filters?: {
    appName?: string;
    environment?: string;
    resolved?: boolean;
  };
}

export default function ErrorListSWRWrapper({ filters = {} }: ErrorListSWRWrapperProps) {
  return (
    <Suspense
      fallback={
        <Box display="flex" justifyContent="center" alignItems="center" height={400}>
          <CircularProgress />
        </Box>
      }
    >
      <ErrorListSWR filters={filters} />
    </Suspense>
  );
}
