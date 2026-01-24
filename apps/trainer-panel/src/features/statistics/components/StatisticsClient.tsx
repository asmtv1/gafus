"use client";

import { Box, Paper, Skeleton, Typography } from "@mui/material";
import { useCourseStatistics } from "@shared/hooks/useStatistics";
import { useSession } from "next-auth/react";

import PageLayout from "@shared/components/PageLayout";
import CoursesList from "./CoursesList";

export default function StatisticsClient() {
  const { data: session, status } = useSession();

  // Всегда вызываем хуки в одном порядке
  const userId = session?.user?.id;
  const isElevated = Boolean(
    session?.user?.role && ["ADMIN", "MODERATOR"].includes(session.user.role),
  );

  const { data, error, isLoading } = useCourseStatistics(userId || "", isElevated);

  if (status === "loading") {
    return (
      <PageLayout title="Статистика" subtitle="Загрузка данных...">
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
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout title="Статистика">
        <Typography variant="h6" color="error" sx={{ textAlign: "center" }}>
          Не авторизован
        </Typography>
      </PageLayout>
    );
  }

  if (isLoading) {
    return (
      <PageLayout title="Статистика" subtitle="Загрузка данных...">
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
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout title="Статистика">
        <Typography variant="h6" color="error" sx={{ textAlign: "center" }}>
          Ошибка загрузки статистики
        </Typography>
      </PageLayout>
    );
  }

  const { courses } = data || { courses: [] };
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <PageLayout title="Статистика" subtitle="Аналитика по вашим курсам и ученикам">
      <CoursesList courses={courses} isAdmin={isAdmin} />
    </PageLayout>
  );
}
