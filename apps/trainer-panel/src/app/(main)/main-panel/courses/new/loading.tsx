"use client";

import { Container, Paper, Skeleton } from "@/utils/muiImports";

export default function NewCourseLoading() {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Skeleton variant="text" width={280} height={40} sx={{ mb: 2 }} />
      <Paper sx={{ p: 3 }}>
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="80%" />
        <Skeleton variant="rounded" height={48} sx={{ my: 2 }} />
        <Skeleton variant="rounded" height={48} sx={{ my: 2 }} />
        <Skeleton variant="rounded" height={200} sx={{ my: 2 }} />
      </Paper>
    </Container>
  );
}
