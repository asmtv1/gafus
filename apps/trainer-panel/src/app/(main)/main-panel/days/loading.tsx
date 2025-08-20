"use client";

import { Box, Paper, Skeleton, Container } from "@/utils/muiImports";

export default function DaysLoading() {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Skeleton variant="rounded" height={48} sx={{ mb: 2 }} />
      <Paper sx={{ p: 2 }}>
        <Skeleton variant="rounded" height={56} sx={{ mb: 2 }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
            <Skeleton variant="circular" width={24} height={24} />
            <Skeleton variant="text" width="40%" />
            <Skeleton variant="text" width="20%" />
            <Skeleton variant="text" width="30%" />
          </Box>
        ))}
      </Paper>
    </Container>
  );
}
