"use client";

import { Box, Container, Paper, Skeleton } from "@/utils/muiImports";

export default function StatisticsLoading() {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Skeleton variant="rounded" height={48} sx={{ mb: 3 }} />
      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Paper key={i} sx={{ p: 2, flex: "1 1 300px", minWidth: 0 }}>
            <Skeleton variant="text" width={120} />
            <Skeleton variant="rounded" height={120} sx={{ my: 1 }} />
            <Skeleton variant="text" width="60%" />
          </Paper>
        ))}
      </Box>
    </Container>
  );
}
