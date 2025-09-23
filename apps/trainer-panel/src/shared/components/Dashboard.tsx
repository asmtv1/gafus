"use client";


import { createTrainerPanelLogger } from "@gafus/logger";
import { 
  Assessment, 
  FitnessCenter, 
  Schedule, 
  School, 
  Add,
  Visibility
} from "@mui/icons-material";
import { 
  Box, 
  Card, 
  CardContent, 
  Typography, 
  Button,
  Chip,
  Avatar,
  Paper,
  Divider
} from "@mui/material";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useCourseStatistics, useStepStatistics } from "@shared/hooks/useStatistics";

// Создаем логгер для dashboard
const logger = createTrainerPanelLogger('trainer-panel-dashboard');

interface _DashboardStats {
  totalCourses: number;
  totalDays: number;
  totalSteps: number;
  totalUsers: number;
  recentActivity: {
    type: 'course' | 'day' | 'step';
    title: string;
    date: string;
    action: 'created' | 'updated';
  }[];
}

export default function Dashboard() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const isElevated = Boolean(
    session?.user?.role && ["ADMIN", "MODERATOR"].includes(session.user.role),
  );

  const { data: statsData, isLoading: coursesLoading } = useCourseStatistics(userId || "", isElevated);
  const { data: stepsData, isLoading: stepsLoading } = useStepStatistics(userId || "", isElevated);
  const courses = statsData?.courses || [];

  // Подсчитываем статистику
  const totalCourses = statsData?.totalCourses || courses.length;
  const totalDays = statsData?.totalDays || 0;
  const totalSteps = stepsData?.totalSteps || 0;
  const isLoading = coursesLoading || stepsLoading;

  // Подсчитываем уникальных учеников для отладки
  const uniqueUserIds = new Set<string>();
  courses.forEach(course => {
    course.userCourses.forEach(userCourse => {
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
    operation: 'warn'
  });

  const statsCards = [
    {
      title: "Курсы",
      value: totalCourses,
      icon: <School sx={{ fontSize: 40, color: "primary.main" }} />,
      color: "primary",
      href: "/main-panel/statistics"
    },
    {
      title: "Дни тренировок",
      value: totalDays,
      icon: <Schedule sx={{ fontSize: 40, color: "success.main" }} />,
      color: "success",
      href: "/main-panel/days"
    },
    {
      title: "Шаги",
      value: totalSteps,
      icon: <FitnessCenter sx={{ fontSize: 40, color: "warning.main" }} />,
      color: "warning",
      href: "/main-panel/steps"
    },
    {
      title: "Ученики",
      value: totalUniqueUsers,
      icon: <Visibility sx={{ fontSize: 40, color: "info.main" }} />,
      color: "info",
      href: "/main-panel/statistics"
    }
  ];

  const quickActions = [
    {
      title: "Создать шаг",
      description: "Добавить новый шаг тренировки",
      icon: <Add />,
      href: "/main-panel/steps/new",
      color: "primary"
    },
    {
      title: "Создать день",
      description: "Создать новый день тренировки",
      icon: <Add />,
      href: "/main-panel/days/new",
      color: "success"
    },
    {
      title: "Создать курс",
      description: "Создать новый курс обучения",
      icon: <Add />,
      href: "/main-panel/courses/new",
      color: "warning"
    }
  ];

  const recentCourses = courses.slice(0, 3);

  return (
    <Box sx={{ p: 3 }}>
      {/* Приветствие */}
      <Paper sx={{ p: 3, mb: 4, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
            <Assessment sx={{ fontSize: 32 }} />
          </Avatar>
          <Box>
            <Typography variant="h4" component="h1" fontWeight="bold">
              Добро пожаловать, {session?.user?.username}!
            </Typography>
            <Typography variant="h6" sx={{ opacity: 0.9 }}>
              Панель управления тренировочными программами
            </Typography>
          </Box>
        </Box>
        <Typography variant="body1" sx={{ opacity: 0.8 }}>
          Управляйте своими курсами, создавайте новые программы обучения и отслеживайте прогресс учеников
        </Typography>
      </Paper>

      {/* Статистические карточки */}
      <Box sx={{ 
        display: 'grid', 
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
        gap: 3,
        mb: 4 
      }}>
        {statsCards.map((card, index) => (
          <Box key={index}>
            <Card 
              sx={{ 
                height: '100%',
                transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 6
                }
              }}
            >
              <CardContent sx={{ textAlign: 'center', p: 3 }}>
                <Box sx={{ mb: 2 }}>
                  {card.icon}
                </Box>
                <Typography variant="h3" component="div" fontWeight="bold" color={`${card.color}.main`}>
                  {isLoading ? '...' : card.value}
                </Typography>
                <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
                  {card.title}
                </Typography>
                <Button 
                  component={Link} 
                  href={card.href}
                  variant="outlined" 
                  size="small"
                    color={card.color as "primary" | "success" | "warning" | "info"}
                >
                  Подробнее
                </Button>
              </CardContent>
            </Card>
          </Box>
        ))}
      </Box>

      <Box sx={{ 
        display: 'grid', 
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
        gap: 3 
      }}>
        {/* Быстрые действия */}
        <Box>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h5" component="h2" gutterBottom fontWeight="bold">
                Быстрые действия
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Создайте новый контент для ваших учеников
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {quickActions.map((action, index) => (
                  <Button
                    key={index}
                    component={Link}
                    href={action.href}
                    variant="outlined"
                    startIcon={action.icon}
                    sx={{ 
                      justifyContent: 'flex-start',
                      p: 2,
                      textAlign: 'left',
                      borderColor: `${action.color}.main`,
                      color: `${action.color}.main`,
                      '&:hover': {
                        backgroundColor: `${action.color}.main`,
                        color: 'white'
                      }
                    }}
                  >
                    <Box>
                      <Typography variant="subtitle1" fontWeight="bold">
                        {action.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
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
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h5" component="h2" gutterBottom fontWeight="bold">
                Последние курсы
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Ваши недавно созданные или обновленные курсы
              </Typography>
              {recentCourses.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {recentCourses.map((course, index) => (
                    <Box key={course.id || index}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="subtitle1" fontWeight="bold" noWrap>
                          {course.name}
                        </Typography>
                        <Chip 
                          label={!course.isPrivate ? 'Публичный' : 'Приватный'} 
                          size="small" 
                          color={!course.isPrivate ? 'success' : 'default'}
                        />
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {course.trainingLevel} уровень
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="caption" color="text.secondary">
                          {course.totalUsers} учеников
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {course.avgRating ? `${course.avgRating.toFixed(1)}★` : 'Нет оценок'}
                        </Typography>
                      </Box>
                      {index < recentCourses.length - 1 && <Divider sx={{ mt: 2 }} />}
                    </Box>
                  ))}
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                    У вас пока нет курсов
                  </Typography>
                  <Button 
                    component={Link} 
                    href="/main-panel/courses/new"
                    variant="contained"
                    startIcon={<Add />}
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
