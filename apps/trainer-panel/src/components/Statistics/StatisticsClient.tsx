"use client";

import CoursesList from "@features/statistics/components/CoursesList";
import { Assessment } from "@mui/icons-material";
import { Box, Container, Paper, Skeleton, Typography } from "@mui/material";
import { useCourseStatistics } from "@shared/hooks/useStatistics";
import { useSession } from "next-auth/react";

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

  if (!session) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Paper sx={{ p: 3, textAlign: "center" }}>
          <Typography variant="h6" color="error">
            Не авторизован
          </Typography>
        </Paper>
      </Container>
    );
  }

  if (isLoading) {
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

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Paper sx={{ p: 3, textAlign: "center" }}>
          <Typography variant="h6" color="error">
            Ошибка загрузки статистики
          </Typography>
        </Paper>
      </Container>
    );
  }

  // Безопасное извлечение данных
  const courses = data?.courses || [];

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Заголовок страницы */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 4 }}>
        <Assessment sx={{ fontSize: 40, color: "primary.main" }} />
        <Typography variant="h3" component="h1" fontWeight="bold">
          Статистика
        </Typography>
      </Box>

      {/* Карточки курсов */}
      <CoursesList courses={courses} />

      {/* Только курсы */}
    </Container>
  );
}
