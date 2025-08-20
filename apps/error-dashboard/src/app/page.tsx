"use client";

import ErrorFiltersWrapper from "@features/errors/components/ErrorFiltersWrapper";
import ErrorListWithFilters from "@features/errors/components/ErrorListWithFilters";
import ErrorStatsSWR from "@features/errors/components/ErrorStatsSWR";
import UserInfo from "@features/errors/components/UserInfo";
import { Box, Container, Typography, CircularProgress } from "@mui/material";
import { FilterProvider } from "@shared/contexts/FilterContext";
import { Suspense } from "react";

// Отключаем статическую генерацию
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <FilterProvider>
      <Box sx={{ minHeight: "100vh", bgcolor: "grey.50" }}>
        <Container maxWidth="xl" sx={{ py: 4 }}>
          <UserInfo />
          <Box mb={4}>
            <Typography variant="h3" component="h1" gutterBottom>
              Дашборд ошибок Gafus
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Мониторинг и управление ошибками в системе
            </Typography>
          </Box>

          <Suspense
            fallback={
              <Box display="flex" justifyContent="center" alignItems="center" height={200}>
                <CircularProgress />
              </Box>
            }
          >
            <Box mb={4}>
              <ErrorStatsSWR />
            </Box>
          </Suspense>

          <Box mb={3}>
            <ErrorFiltersWrapper />
          </Box>

          <Box>
            <ErrorListWithFilters />
          </Box>
        </Container>
      </Box>
    </FilterProvider>
  );
}
