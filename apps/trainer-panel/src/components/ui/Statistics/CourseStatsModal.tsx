import {
  Category,
  Close,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Lock as LockIcon,
  Person,
  Public as PublicIcon,
  Star,
  TrendingUp,
} from "@mui/icons-material";
import Image from "next/image";
import NextLink from "next/link";
import React, { useState } from "react";


// Функция для получения русского названия уровня сложности
const getTrainingLevelLabel = (level: string) => {
  switch (level) {
    case "BEGINNER":
      return "Начальный";
    case "INTERMEDIATE":
      return "Средний";
    case "ADVANCED":
      return "Продвинутый";
    case "EXPERT":
      return "Экспертный";
    default:
      return level;
  }
};

// Функция для получения цвета уровня сложности
const getTrainingLevelColor = (level: string) => {
  switch (level) {
    case "BEGINNER":
      return "success";
    case "INTERMEDIATE":
      return "info";
    case "ADVANCED":
      return "warning";
    case "EXPERT":
      return "error";
    default:
      return "default";
  }
};

import DayAnalytics from "@/features/statistics/components/DayAnalytics";
import ProgressAnalytics from "@/features/statistics/components/ProgressAnalytics";
import SocialAnalytics from "@/features/statistics/components/SocialAnalytics";
import TimeAnalytics from "@/features/statistics/components/TimeAnalytics";
import { Toast } from "@/shared/components/ui";
import { useToast } from "@/shared/components/ui/Toast";
import { deleteCourseServerAction } from "@/shared/lib/actions/courses";
import {
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Tab,
  Tabs,
  Typography,
} from "@/utils/muiImports";

import type { DetailedCourseStats } from "@gafus/types";

interface CourseStatsModalProps {
  course: DetailedCourseStats | null;
  open: boolean;
  onClose: () => void;
  onDeleted?: (courseId: string) => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`analytics-tabpanel-${index}`}
      aria-labelledby={`analytics-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function CourseStatsModal({
  course,
  open,
  onClose,
  onDeleted,
}: CourseStatsModalProps) {
  const [tabValue, setTabValue] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { open: toastOpen, message, severity, showToast, closeToast } = useToast();

  if (!course) return null;

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleDeleteCourse = async () => {
    try {
      const res = await deleteCourseServerAction(course.id);
      if (!res.success) {
        showToast(res.error || "Ошибка удаления курса", "error");
        return;
      }
      setShowDeleteConfirm(false);
      onClose();
      if (onDeleted) onDeleted(course.id);
      showToast("Курс удалён", "success");
    } catch (e) {
      console.error(e);
      showToast("Ошибка удаления курса", "error");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          maxHeight: "90vh",
        },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="h5" component="h2">
            Детальная статистика курса
          </Typography>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 0 }}>
        {/* Заголовок курса */}
        <Box sx={{ display: "flex", alignItems: "flex-start", mb: 3 }}>
          <Avatar
            sx={{
              width: 100,
              height: 100,
              mr: 3,
              borderRadius: 2,
            }}
          >
            <Image
              src={course.logoImg || "/shared/uploads/course-logo.jpg"}
              alt={course.name}
              width={100}
              height={100}
              style={{ borderRadius: "8px" }}
            />
          </Avatar>

          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" component="h3" gutterBottom>
              {course.name}
            </Typography>

            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2, alignItems: "center" }}>
              <Chip
                icon={course.isPrivate ? <LockIcon /> : <PublicIcon />}
                label={course.isPrivate ? "Приватный" : "Публичный"}
                size="medium"
                color={course.isPrivate ? "default" : "success"}
                variant="outlined"
              />
              <Chip
                icon={<TrendingUp />}
                label={getTrainingLevelLabel(course.trainingLevel)}
                size="medium"
                color={
                  getTrainingLevelColor(course.trainingLevel) as
                    | "error"
                    | "default"
                    | "info"
                    | "primary"
                    | "secondary"
                    | "success"
                    | "warning"
                }
                variant="outlined"
              />
              <Chip
                icon={<Person />}
                label={`${course.totalUsers || 0} пользователей`}
                size="medium"
                color="primary"
                variant="outlined"
              />
              <Chip
                icon={<Category />}
                label={`${course.completedUsers || 0} завершили`}
                size="medium"
                color="secondary"
                variant="outlined"
              />
              <Chip
                icon={<Star />}
                label={`${course.avgRating?.toFixed(1) || "0"} ★`}
                size="medium"
                color="warning"
                variant="outlined"
              />
            </Box>

            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button
                component={NextLink}
                href={`/main-panel/courses/${course.id}/edit`}
                size="small"
                variant="contained"
                color="primary"
                startIcon={<EditIcon />}
                sx={{ mb: 1 }}
              >
                Редактировать курс
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => setShowDeleteConfirm(true)}
                sx={{ mb: 1 }}
              >
                Удалить курс
              </Button>
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Табы для разных типов аналитики */}
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="analytics tabs">
            <Tab label="Общая статистика" />
            <Tab label="Аналитика по дням" />
            <Tab label="Временная аналитика" />
            <Tab label="Прогресс и достижения" />
            <Tab label="Социальная аналитика" />
          </Tabs>
        </Box>

        {/* Общая статистика */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 3 }}>
            <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>
              <Paper sx={{ p: 2, textAlign: "center" }}>
                <Typography variant="h4" color="primary" fontWeight="bold">
                  {course.totalUsers || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Всего пользователей
                </Typography>
              </Paper>
            </Box>
            <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>
              <Paper sx={{ p: 2, textAlign: "center" }}>
                <Typography variant="h4" color="success.main" fontWeight="bold">
                  {course.completedUsers || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Завершили курс
                </Typography>
              </Paper>
            </Box>
            <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>
              <Paper sx={{ p: 2, textAlign: "center" }}>
                <Typography variant="h4" color="warning.main" fontWeight="bold">
                  {course.inProgressUsers || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  В процессе
                </Typography>
              </Paper>
            </Box>
          </Box>

          {/* Процент завершения */}
          {(course.totalUsers || 0) > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Процент успешно завершивших курс
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Box sx={{ flex: 1, bgcolor: "grey.200", borderRadius: 1, height: 20 }}>
                  <Box
                    sx={{
                      width: `${((course.completedUsers || 0) / (course.totalUsers || 1)) * 100}%`,
                      height: "100%",
                      bgcolor: "success.main",
                      borderRadius: 1,
                      transition: "width 0.3s ease",
                    }}
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {Math.round(((course.completedUsers || 0) / (course.totalUsers || 1)) * 100)}%
                </Typography>
              </Box>
            </Box>
          )}

          {/* Список пользователей */}
          {course.userCourses && course.userCourses.length > 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Пользователи курса
              </Typography>
              <Box sx={{ maxHeight: 300, overflowY: "auto" }}>
                {course.userCourses.map(
                  (
                    userCourse: {
                      userId: string;
                      status: string;
                      startedAt: Date | null;
                      completedAt: Date | null;
                      user: { username: string; profile: { avatarUrl: string | null } };
                    },
                    index: number,
                  ) => (
                    <Paper key={index} sx={{ p: 2, mb: 1 }}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                          <Avatar sx={{ width: 40, height: 40 }}>
                            <Image
                              src={
                                userCourse.user.profile?.avatarUrl || "/uploads/shared/avatar.svg"
                              }
                              alt={userCourse.user.username}
                              width={40}
                              height={40}
                            />
                          </Avatar>
                          <Box>
                            <Typography variant="body1" fontWeight="bold">
                              {userCourse.user.username}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Статус: {userCourse.status}
                            </Typography>
                          </Box>
                        </Box>
                        <Box sx={{ textAlign: "right" }}>
                          {userCourse.startedAt && (
                            <Typography variant="body2" color="text.secondary">
                              Начал: {new Date(userCourse.startedAt).toLocaleDateString()}
                            </Typography>
                          )}
                          {userCourse.completedAt && (
                            <Typography variant="body2" color="success.main">
                              Завершил: {new Date(userCourse.completedAt).toLocaleDateString()}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </Paper>
                  ),
                )}
              </Box>
            </Box>
          )}

          {/* Отзывы */}
          {course.reviews && course.reviews.length > 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Последние отзывы
              </Typography>
              <Box sx={{ maxHeight: 260, overflowY: "auto" }}>
                {course.reviews.slice(0, 5).map((review, index: number) => (
                  <Paper key={index} sx={{ p: 2, mb: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                      <Avatar sx={{ width: 40, height: 40 }}>
                        <Image
                          src={review.user?.profile?.avatarUrl || "/uploads/shared/avatar.svg"}
                          alt={review.user?.username || "user"}
                          width={40}
                          height={40}
                        />
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                          <Typography variant="body2" fontWeight="bold">
                            {review.user?.username || "Неизвестный пользователь"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {review.createdAt
                              ? new Date(review.createdAt).toLocaleDateString()
                              : ""}
                          </Typography>
                        </Box>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                          <Star sx={{ color: "warning.main", fontSize: 16 }} />
                          <Typography variant="body2" fontWeight="bold">
                            {review.rating} ★
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          {review.comment}
                        </Typography>
                      </Box>
                    </Box>
                  </Paper>
                ))}
              </Box>
            </Box>
          )}
        </TabPanel>

        {/* Аналитика по дням */}
        <TabPanel value={tabValue} index={1}>
          <DayAnalytics dayAnalytics={course.dayAnalytics || []} />
        </TabPanel>

        {/* Временная аналитика */}
        <TabPanel value={tabValue} index={2}>
          <TimeAnalytics
            timeAnalytics={
              course.timeAnalytics || {
                activityByDayOfWeek: {},
                activityByHour: {},
                activityByMonth: {},
                averageTimeBetweenSessions: 0,
              }
            }
          />
        </TabPanel>

        {/* Прогресс и достижения */}
        <TabPanel value={tabValue} index={3}>
          <ProgressAnalytics
            progressAnalytics={
              course.progressAnalytics || {
                averageCompletionTime: 0,
                dropoutPoints: [],
                repeatUsers: 0,
                achievements: [],
              }
            }
          />
        </TabPanel>

        {/* Социальная аналитика */}
        <TabPanel value={tabValue} index={4}>
          <SocialAnalytics
            socialAnalytics={
              course.socialAnalytics || {
                ratingDistribution: {},
                reviewSentiment: { positive: 0, neutral: 0, negative: 0 },
                favoriteCount: 0,
                recommendationEffectiveness: 0,
              }
            }
          />
        </TabPanel>
      </DialogContent>
      {/* Подтверждение удаления */}
      {showDeleteConfirm && (
        <Dialog open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
          <DialogTitle>Подтверждение удаления</DialogTitle>
          <DialogContent>
            <Typography>Вы уверены, что хотите удалить «{course.name}»?</Typography>
            <Box sx={{ display: "flex", gap: 1, mt: 2, justifyContent: "flex-end" }}>
              <Button onClick={() => setShowDeleteConfirm(false)}>Нет</Button>
              <Button color="error" variant="contained" onClick={handleDeleteCourse}>
                Да
              </Button>
            </Box>
          </DialogContent>
        </Dialog>
      )}
      <Toast open={toastOpen} message={message} severity={severity} onClose={closeToast} />
    </Dialog>
  );
}
