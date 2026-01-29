"use client";

import { createTrainerPanelLogger } from "@gafus/logger";
import { Assessment, FitnessCenter, Schedule, School, Add, Visibility } from "@mui/icons-material";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Avatar,
  Paper,
  Divider,
} from "@mui/material";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useCourseStatistics, useStepStatistics } from "@shared/hooks/useStatistics";

// Создаем логгер для dashboard
const logger = createTrainerPanelLogger("trainer-panel-dashboard");

interface _DashboardStats {
  totalCourses: number;
  totalDays: number;
  totalSteps: number;
  totalUsers: number;
  recentActivity: {
    type: "course" | "day" | "step";
    title: string;
    date: string;
    action: "created" | "updated";
  }[];
}

export default function Dashboard() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const isElevated = Boolean(
    session?.user?.role && ["ADMIN", "MODERATOR"].includes(session.user.role),
  );

  const { data: statsData, isLoading: coursesLoading } = useCourseStatistics(
    userId || "",
    isElevated,
  );
  const { data: stepsData, isLoading: stepsLoading } = useStepStatistics(userId || "", isElevated);
  const courses = statsData?.courses || [];

  // Подсчитываем статистику
  const totalCourses = statsData?.totalCourses || courses.length;
  const totalDays = statsData?.totalDays || 0;
  const totalSteps = stepsData?.totalSteps || 0;
  const isLoading = coursesLoading || stepsLoading;

  // Подсчитываем уникальных учеников для отладки
  const uniqueUserIds = new Set<string>();
  courses.forEach((course) => {
    course.userCourses.forEach((userCourse) => {
      uniqueUserIds.add(userCourse.userId);
    });
  });
  const totalUniqueUsers = uniqueUserIds.size;
  const totalUserEnrollments = courses.reduce((acc, course) => acc + course.totalUsers, 0);

  // Отладочная информация
  logger.warn("Dashboard Debug:", {
    userId,
    isElevated,
    statsData,
    stepsData,
    totalSteps,
    stepsLoading,
    totalUniqueUsers,
    totalUserEnrollments,
    coursesCount: courses.length,
    operation: "warn",
  });

  const statsCards = [
    {
      title: "Курсы",
      value: totalCourses,
      icon: <School sx={{ fontSize: 40, color: "primary.main" }} />,
      color: "primary",
      href: "/main-panel/statistics",
    },
    {
      title: "Дни тренировок",
      value: totalDays,
      icon: <Schedule sx={{ fontSize: 40, color: "success.main" }} />,
      color: "success",
      href: "/main-panel/days",
    },
    {
      title: "Шаги",
      value: totalSteps,
      icon: <FitnessCenter sx={{ fontSize: 40, color: "warning.main" }} />,
      color: "warning",
      href: "/main-panel/steps",
    },
    {
      title: "Ученики",
      value: totalUniqueUsers,
      icon: <Visibility sx={{ fontSize: 40, color: "info.main" }} />,
      color: "info",
      href: "/main-panel/statistics",
    },
  ];

  const quickActions = [
    {
      title: "Создать шаг",
      description: "Добавить новый шаг тренировки",
      icon: <Add />,
      href: "/main-panel/steps/new",
      color: "primary",
    },
    {
      title: "Создать день",
      description: "Создать новый день тренировки",
      icon: <Add />,
      href: "/main-panel/days/new",
      color: "success",
    },
    {
      title: "Создать курс",
      description: "Создать новый курс обучения",
      icon: <Add />,
      href: "/main-panel/courses/new",
      color: "warning",
    },
  ];

  const recentCourses = courses.slice(0, 3);

  return (
    <Box
      sx={{
        p: { xs: 2, sm: 2.5, md: 3 },
        width: "100%",
        maxWidth: "100%",
        overflow: "hidden",
      }}
    >
      {/* Приветствие */}
      <Paper
        sx={{
          p: { xs: 2, sm: 2.5, md: 3 },
          mb: { xs: 2.5, sm: 3, md: 4 },
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
          borderRadius: { xs: 2, md: 3 },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: { xs: 1.5, sm: 2 },
            mb: { xs: 1.5, sm: 2 },
            flexDirection: { xs: "row", sm: "row" },
          }}
        >
          <Avatar
            sx={{
              bgcolor: "rgba(255,255,255,0.2)",
              width: { xs: 48, sm: 56 },
              height: { xs: 48, sm: 56 },
              flexShrink: 0,
            }}
          >
            <Assessment sx={{ fontSize: { xs: 28, sm: 32 } }} />
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="h4"
              component="h1"
              fontWeight="bold"
              sx={{
                fontSize: { xs: "1.25rem", sm: "1.75rem", md: "2.125rem" },
                lineHeight: 1.3,
                mb: { xs: 0.25, sm: 0.5 },
              }}
            >
              Добро пожаловать, {session?.user?.username}!
            </Typography>
            <Typography
              variant="h6"
              sx={{
                opacity: 0.9,
                fontSize: { xs: "0.875rem", sm: "1rem", md: "1.25rem" },
                lineHeight: 1.4,
              }}
            >
              Панель управления тренировочными программами
            </Typography>
          </Box>
        </Box>
        <Typography
          variant="body1"
          sx={{
            opacity: 0.8,
            fontSize: { xs: "0.875rem", sm: "0.9375rem", md: "1rem" },
            lineHeight: 1.5,
            display: { xs: "none", sm: "block" },
          }}
        >
          Управляйте своими курсами, создавайте новые программы обучения и отслеживайте прогресс
          учеников
        </Typography>
      </Paper>

      {/* Статистические карточки */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            md: "repeat(4, 1fr)",
          },
          gap: { xs: 2, sm: 2.5, md: 3 },
          mb: { xs: 2.5, sm: 3, md: 4 },
        }}
      >
        {statsCards.map((card, index) => (
          <Box key={index}>
            <Card
              sx={{
                height: "100%",
                transition: "transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out",
                borderRadius: { xs: 2, md: 3 },
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
                "&:hover": {
                  transform: { xs: "none", sm: "translateY(-4px)" },
                  boxShadow: { xs: 2, sm: 6 },
                },
              }}
            >
              <CardContent
                sx={{
                  textAlign: "center",
                  p: { xs: 2, sm: 2.5, md: 3 },
                }}
              >
                <Box sx={{ mb: { xs: 1.5, sm: 2 } }}>{card.icon}</Box>
                <Typography
                  variant="h3"
                  component="div"
                  fontWeight="bold"
                  color={`${card.color}.main`}
                  sx={{
                    fontSize: { xs: "2rem", sm: "2.5rem", md: "3rem" },
                    mb: { xs: 0.5, sm: 1 },
                  }}
                >
                  {isLoading ? "..." : card.value}
                </Typography>
                <Typography
                  variant="h6"
                  color="text.secondary"
                  sx={{
                    mb: { xs: 1.5, sm: 2 },
                    fontSize: { xs: "0.95rem", sm: "1.1rem", md: "1.25rem" },
                  }}
                >
                  {card.title}
                </Typography>
                <Button
                  component={Link}
                  href={card.href}
                  variant="outlined"
                  size="small"
                  color={card.color as "primary" | "success" | "warning" | "info"}
                  sx={{
                    fontSize: { xs: "0.8125rem", sm: "0.875rem" },
                    WebkitTapHighlightColor: "transparent",
                    touchAction: "manipulation",
                    minHeight: { xs: "44px", sm: "auto" },
                  }}
                >
                  Подробнее
                </Button>
              </CardContent>
            </Card>
          </Box>
        ))}
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
          gap: { xs: 2, sm: 2.5, md: 3 },
        }}
      >
        {/* Быстрые действия */}
        <Box>
          <Card
            sx={{
              height: "100%",
              borderRadius: { xs: 2, md: 3 },
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
            }}
          >
            <CardContent sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>
              <Typography
                variant="h5"
                component="h2"
                gutterBottom
                fontWeight="bold"
                sx={{ fontSize: { xs: "1.125rem", sm: "1.25rem", md: "1.5rem" } }}
              >
                Быстрые действия
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mb: { xs: 2, sm: 2.5, md: 3 },
                  fontSize: { xs: "0.8125rem", sm: "0.875rem" },
                }}
              >
                Создайте новый контент для ваших учеников
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: { xs: 1.5, sm: 2 },
                }}
              >
                {quickActions.map((action, index) => (
                  <Button
                    key={index}
                    component={Link}
                    href={action.href}
                    variant="outlined"
                    startIcon={action.icon}
                    sx={{
                      justifyContent: "flex-start",
                      p: { xs: 1.5, sm: 2 },
                      textAlign: "left",
                      borderColor: `${action.color}.main`,
                      color: `${action.color}.main`,
                      WebkitTapHighlightColor: "transparent",
                      touchAction: "manipulation",
                      minHeight: { xs: "52px", sm: "auto" },
                      "&:hover": {
                        backgroundColor: `${action.color}.main`,
                        color: "white",
                      },
                    }}
                  >
                    <Box>
                      <Typography
                        variant="subtitle1"
                        fontWeight="bold"
                        sx={{ fontSize: { xs: "0.9375rem", sm: "1rem" } }}
                      >
                        {action.title}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          fontSize: { xs: "0.8125rem", sm: "0.875rem" },
                          display: { xs: "none", sm: "block" },
                        }}
                      >
                        {action.description}
                      </Typography>
                    </Box>
                  </Button>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Последние курсы */}
        <Box>
          <Card
            sx={{
              height: "100%",
              borderRadius: { xs: 2, md: 3 },
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
            }}
          >
            <CardContent sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>
              <Typography
                variant="h5"
                component="h2"
                gutterBottom
                fontWeight="bold"
                sx={{ fontSize: { xs: "1.125rem", sm: "1.25rem", md: "1.5rem" } }}
              >
                Последние курсы
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mb: { xs: 2, sm: 2.5, md: 3 },
                  fontSize: { xs: "0.8125rem", sm: "0.875rem" },
                }}
              >
                Ваши недавно созданные или обновленные курсы
              </Typography>
              {recentCourses.length > 0 ? (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: { xs: 1.5, sm: 2 },
                  }}
                >
                  {recentCourses.map((course, index) => (
                    <Box key={course.id || index}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          mb: 1,
                          gap: 1,
                        }}
                      >
                        <Typography
                          variant="subtitle1"
                          fontWeight="bold"
                          sx={{
                            fontSize: { xs: "0.9375rem", sm: "1rem" },
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {course.name}
                        </Typography>
                        <Chip
                          label={
                            course.isPaid
                              ? "Платный"
                              : !course.isPrivate
                                ? "Публичный"
                                : "Приватный"
                          }
                          size="small"
                          color={
                            course.isPaid
                              ? "warning"
                              : !course.isPrivate
                                ? "success"
                                : "default"
                          }
                          sx={{
                            fontSize: { xs: "0.6875rem", sm: "0.8125rem" },
                            height: { xs: "20px", sm: "24px" },
                            flexShrink: 0,
                          }}
                        />
                      </Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mb: 1,
                          fontSize: { xs: "0.8125rem", sm: "0.875rem" },
                        }}
                      >
                        {course.trainingLevel} уровень
                      </Typography>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: { xs: 1.5, sm: 2 },
                          flexWrap: "wrap",
                        }}
                      >
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: { xs: "0.75rem", sm: "0.8125rem" } }}
                        >
                          {course.totalUsers} учеников
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: { xs: "0.75rem", sm: "0.8125rem" } }}
                        >
                          {course.avgRating ? `${course.avgRating.toFixed(1)}★` : "Нет оценок"}
                        </Typography>
                      </Box>
                      {index < recentCourses.length - 1 && (
                        <Divider sx={{ mt: { xs: 1.5, sm: 2 } }} />
                      )}
                    </Box>
                  ))}
                </Box>
              ) : (
                <Box sx={{ textAlign: "center", py: { xs: 3, sm: 4 } }}>
                  <Typography
                    variant="body1"
                    color="text.secondary"
                    sx={{
                      mb: 2,
                      fontSize: { xs: "0.9375rem", sm: "1rem" },
                    }}
                  >
                    У вас пока нет курсов
                  </Typography>
                  <Button
                    component={Link}
                    href="/main-panel/courses/new"
                    variant="contained"
                    startIcon={<Add />}
                    sx={{
                      WebkitTapHighlightColor: "transparent",
                      touchAction: "manipulation",
                      minHeight: { xs: "44px", sm: "auto" },
                    }}
                  >
                    Создать первый курс
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
