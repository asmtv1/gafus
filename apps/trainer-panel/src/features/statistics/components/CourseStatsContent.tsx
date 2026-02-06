"use client";

import {
  Category,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
  Face as FaceIcon,
  Lock as LockIcon,
  MonetizationOn as PaidIcon,
  Person,
  Public as PublicIcon,
  Star,
} from "@mui/icons-material";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { createTrainerPanelLogger } from "@gafus/logger";

import DayAnalytics from "./DayAnalytics";
import ProgressAnalytics from "./ProgressAnalytics";
import SocialAnalytics from "./SocialAnalytics";
import TimeAnalytics from "./TimeAnalytics";
import UserPublicModal from "./UserPublicModal";
import { Toast, useToast } from "@shared/components/ui/Toast";
import { deleteCourseServerAction } from "@shared/lib/actions/courses";
import { getUserProgress, type UserDetailedProgress } from "@shared/lib/actions/getUserProgress";
// Создаем логгер для CourseStatsContent
const logger = createTrainerPanelLogger("trainer-panel-course-stats");

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@/utils/muiImports";

import type { DetailedCourseStats } from "@gafus/statistics";
import { TrainingStatus } from "@gafus/types";

interface CourseStatsContentProps {
  course: DetailedCourseStats;
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

export default function CourseStatsContent({ course, onDeleted }: CourseStatsContentProps) {
  const [tabValue, setTabValue] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  const [dateType, setDateType] = useState<"started" | "completed">("started");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [showCompleted, setShowCompleted] = useState(true);
  const [showInProgress, setShowInProgress] = useState(true);
  const { open: toastOpen, message, severity, showToast, closeToast } = useToast();
  const router = useRouter();

  if (!course) return null;

  // Функция для нормализации даты к началу дня в локальном времени
  const normalizeDateToLocalMidnight = (date: Date | string): Date => {
    const d = new Date(date);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

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
      if (onDeleted) {
        onDeleted(course.id);
      } else {
        router.push("/main-panel/statistics");
      }
      showToast("Курс удалён", "success");
    } catch (e) {
      logger.error("Ошибка удаления курса", e as Error, {
        operation: "delete_course_error",
        courseId: course.id,
      });
      showToast("Ошибка удаления курса", "error");
    }
  };

  return (
    <Box sx={{ px: { xs: 1, sm: 2 }, maxWidth: "100%", overflow: "hidden" }}>
      {/* Заголовок курса */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "flex-start", sm: "flex-start" },
          mb: 3,
        }}
      >
        <Avatar
          sx={{
            width: { xs: 60, sm: 80, md: 100 },
            height: { xs: 60, sm: 80, md: 100 },
            mr: { xs: 0, sm: 2, md: 3 },
            mb: { xs: 2, sm: 0 },
            borderRadius: 2,
          }}
          src={course.logoImg || "/uploads/course-logo.webp"}
          alt={course.name}
          variant="rounded"
        />

        <Box sx={{ flex: 1, minWidth: 0, maxWidth: "100%" }}>
          <Typography
            variant="h4"
            component="h3"
            gutterBottom
            color="text.primary"
            sx={{
              fontSize: { xs: "1.5rem", sm: "2rem", md: "2.5rem" },
              wordBreak: "break-word",
              overflow: "hidden",
            }}
          >
            {course.name}
          </Typography>

          <Box
            sx={{
              display: "flex",
              gap: 1,
              flexWrap: "wrap",
              mb: 2,
              alignItems: "center",
            }}
          >
            <Chip
              icon={
                course.isPaid ? (
                  <PaidIcon />
                ) : course.isPrivate ? (
                  <LockIcon />
                ) : (
                  <PublicIcon />
                )
              }
              label={
                course.isPaid ? "Платный" : course.isPrivate ? "Приватный" : "Публичный"
              }
              size="medium"
              color={
                course.isPaid ? "warning" : course.isPrivate ? "default" : "success"
              }
              variant="outlined"
              sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
            />
            {course.isPersonalized && (
              <Chip
                icon={<FaceIcon />}
                label="Персонализированный"
                size="medium"
                color="secondary"
                variant="outlined"
                sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
              />
            )}
            <Chip
              icon={<Person />}
              label={`${course.totalUsers || 0} пользователей`}
              size="medium"
              color="primary"
              variant="outlined"
              sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
            />
            <Chip
              icon={<Category />}
              label={`${course.completedUsers || 0} завершили`}
              size="medium"
              color="secondary"
              variant="outlined"
              sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
            />
            <Chip
              icon={<Star />}
              label={`${course.avgRating?.toFixed(1) || "0"} ★`}
              size="medium"
              color="warning"
              variant="outlined"
              sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
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
              sx={{ mb: 1, fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
            >
              Редактировать курс
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => setShowDeleteConfirm(true)}
              sx={{ mb: 1, fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
            >
              Удалить курс
            </Button>
          </Box>
        </Box>
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Табы для разных типов аналитики */}
      <Box
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          overflowX: { xs: "auto", sm: "visible" },
        }}
      >
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="analytics tabs"
          sx={{
            "& .MuiTab-root": {
              fontSize: { xs: "0.75rem", sm: "0.875rem", md: "1rem" },
              minWidth: { xs: "auto", sm: 160 },
              padding: { xs: "12px 8px", sm: "12px 16px" },
            },
          }}
        >
          <Tab label="Общая статистика" />
          <Tab label="Аналитика по дням" />
          <Tab label="Временная аналитика" />
          <Tab label="Прогресс и достижения" />
          <Tab label="Социальная аналитика" />
        </Tabs>
      </Box>

      {/* Общая статистика */}
      <TabPanel value={tabValue} index={0}>
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: { xs: 1, sm: 2 },
            mb: 3,
            maxWidth: "100%",
          }}
        >
          <Box sx={{ flex: { xs: "1 1 100%", sm: "1 1 200px" }, minWidth: 0 }}>
            <Paper sx={{ p: { xs: 1.5, sm: 2 }, textAlign: "center" }}>
              <Typography
                variant="h4"
                color="primary"
                fontWeight="bold"
                sx={{ fontSize: { xs: "1.5rem", sm: "2rem" } }}
              >
                {course.totalUsers || 0}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
              >
                Всего пользователей
              </Typography>
            </Paper>
          </Box>
          <Box sx={{ flex: { xs: "1 1 100%", sm: "1 1 200px" }, minWidth: 0 }}>
            <Paper sx={{ p: { xs: 1.5, sm: 2 }, textAlign: "center" }}>
              <Typography
                variant="h4"
                color="success.main"
                fontWeight="bold"
                sx={{ fontSize: { xs: "1.5rem", sm: "2rem" } }}
              >
                {course.completedUsers || 0}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
              >
                Завершили курс
              </Typography>
            </Paper>
          </Box>
          <Box sx={{ flex: { xs: "1 1 100%", sm: "1 1 200px" }, minWidth: 0 }}>
            <Paper sx={{ p: { xs: 1.5, sm: 2 }, textAlign: "center" }}>
              <Typography
                variant="h4"
                color="warning.main"
                fontWeight="bold"
                sx={{ fontSize: { xs: "1.5rem", sm: "2rem" } }}
              >
                {course.inProgressUsers || 0}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
              >
                В процессе
              </Typography>
            </Paper>
          </Box>
        </Box>

        {/* Процент завершения */}
        {(course.totalUsers || 0) > 0 && (
          <Box sx={{ mb: 3, maxWidth: "100%", overflow: "hidden" }}>
            <Typography
              variant="h6"
              gutterBottom
              color="primary"
              sx={{ fontSize: { xs: "1rem", sm: "1.25rem" } }}
            >
              Процент успешно завершивших курс
            </Typography>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: { xs: 1, sm: 2 },
                maxWidth: "100%",
              }}
            >
              <Box
                sx={{
                  flex: 1,
                  bgcolor: "grey.200",
                  borderRadius: 1,
                  height: { xs: 16, sm: 20 },
                  minWidth: 0,
                }}
              >
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
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  fontSize: { xs: "0.75rem", sm: "0.875rem" },
                  flexShrink: 0,
                }}
              >
                {Math.round(((course.completedUsers || 0) / (course.totalUsers || 1)) * 100)}%
              </Typography>
            </Box>
          </Box>
        )}

        {/* Список пользователей с фильтрами */}
        {course.userCourses && course.userCourses.length > 0 && (
          <Box sx={{ maxWidth: "100%", overflow: "hidden" }}>
            <Typography
              variant="h6"
              gutterBottom
              color="text.primary"
              sx={{ fontSize: { xs: "1rem", sm: "1.25rem" } }}
            >
              Пользователи курса
            </Typography>

            {/* Панель фильтров */}
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                gap: { xs: 1, sm: 2 },
                mb: 2,
                alignItems: { xs: "stretch", sm: "flex-end" },
              }}
            >
              <FormControl
                size="small"
                sx={{
                  minWidth: { xs: "100%", sm: 180 },
                  width: { xs: "100%", sm: "auto" },
                }}
              >
                <InputLabel id="date-type-label">Тип даты</InputLabel>
                <Select
                  labelId="date-type-label"
                  label="Тип даты"
                  value={dateType}
                  onChange={(e) => setDateType(e.target.value as "started" | "completed")}
                >
                  <MenuItem value="started">Начал</MenuItem>
                  <MenuItem value="completed">Завершил</MenuItem>
                </Select>
              </FormControl>

              <TextField
                size="small"
                label="От"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                sx={{ width: { xs: "100%", sm: "auto" } }}
              />
              <TextField
                size="small"
                label="До"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                sx={{ width: { xs: "100%", sm: "auto" } }}
              />

              <Box
                sx={{
                  display: "flex",
                  flexDirection: { xs: "row", sm: "row" },
                  gap: { xs: 1, sm: 2 },
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                  >
                    Завершил
                  </Typography>
                  <Switch
                    checked={showCompleted}
                    onChange={(e) => setShowCompleted(e.target.checked)}
                    size="small"
                  />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                  >
                    В процессе
                  </Typography>
                  <Switch
                    checked={showInProgress}
                    onChange={(e) => setShowInProgress(e.target.checked)}
                    size="small"
                  />
                </Box>
              </Box>
            </Box>

            <Box sx={{ maxHeight: 600, overflowY: "auto" }}>
              {course.userCourses
                .filter((uc) => {
                  const status = uc.status;
                  if (status === "COMPLETED" && !showCompleted) return false;
                  if (status === "IN_PROGRESS" && !showInProgress) return false;
                  if (dateFrom || dateTo) {
                    const dateValue = dateType === "started" ? uc.startedAt : uc.completedAt;
                    if (!dateValue) return false;
                    const userDate = normalizeDateToLocalMidnight(dateValue);
                    if (dateFrom) {
                      const fromDate = normalizeDateToLocalMidnight(dateFrom);
                      if (userDate < fromDate) return false;
                    }
                    if (dateTo) {
                      const toDate = normalizeDateToLocalMidnight(dateTo);
                      if (userDate > toDate) return false;
                    }
                  }
                  return true;
                })
                .sort((a, b) => {
                  const getDate = (uc: typeof a) =>
                    dateType === "started" ? uc.startedAt : uc.completedAt;
                  const da = getDate(a) ? new Date(getDate(a) as Date).getTime() : 0;
                  const db = getDate(b) ? new Date(getDate(b) as Date).getTime() : 0;
                  return db - da;
                })
                .map((userCourse, index: number) => (
                  <UserProgressAccordion
                    key={index}
                    userCourse={userCourse}
                    courseId={course.id}
                    onUsernameClick={() => {
                      setSelectedUsername(userCourse.user.username);
                      setUserModalOpen(true);
                    }}
                  />
                ))}
            </Box>
          </Box>
        )}

        {/* Отзывы */}
        {course.reviews && course.reviews.length > 0 && (
          <Box sx={{ maxWidth: "100%", overflow: "hidden" }}>
            <Typography
              variant="h6"
              gutterBottom
              color="text.primary"
              sx={{ fontSize: { xs: "1rem", sm: "1.25rem" } }}
            >
              Последние отзывы
            </Typography>
            <Box sx={{ maxHeight: 260, overflowY: "auto" }}>
              {course.reviews.slice(0, 5).map((review, index: number) => (
                <Paper
                  key={index}
                  sx={{
                    p: { xs: 1.5, sm: 2 },
                    mb: 1,
                    maxWidth: "100%",
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: { xs: 1, sm: 2 },
                      maxWidth: "100%",
                    }}
                  >
                    <Avatar
                      sx={{
                        width: { xs: 32, sm: 40 },
                        height: { xs: 32, sm: 40 },
                        flexShrink: 0,
                      }}
                      src={review.user?.profile?.avatarUrl || "/uploads/avatar.svg"}
                      alt={review.user?.username || "user"}
                    />
                    <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: { xs: "column", sm: "row" },
                          alignItems: { xs: "flex-start", sm: "center" },
                          gap: { xs: 0.5, sm: 1 },
                          mb: 0.5,
                          flexWrap: "wrap",
                        }}
                      >
                        <Typography
                          variant="body2"
                          fontWeight="bold"
                          sx={{
                            fontSize: { xs: "0.75rem", sm: "0.875rem" },
                            wordBreak: "break-word",
                          }}
                        >
                          {review.user?.username || "Неизвестный пользователь"}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: { xs: "0.625rem", sm: "0.75rem" } }}
                        >
                          {review.createdAt ? new Date(review.createdAt).toLocaleDateString() : ""}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          mb: 1,
                        }}
                      >
                        <Star
                          sx={{
                            color: "warning.main",
                            fontSize: { xs: 14, sm: 16 },
                          }}
                        />
                        <Typography
                          variant="body2"
                          fontWeight="bold"
                          sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                        >
                          {review.rating} ★
                        </Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          fontSize: { xs: "0.75rem", sm: "0.875rem" },
                          wordBreak: "break-word",
                        }}
                      >
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
          timeAnalytics={{
            activityByDayOfWeek: course.timeAnalytics?.activityByDayOfWeek || {},
            activityByHour: course.timeAnalytics?.activityByHour || {},
            activityByMonth: course.timeAnalytics?.activityByMonth || {},
            averageTimeBetweenSessions: course.timeAnalytics?.averageTimeBetweenSessions || 0,
          }}
        />
      </TabPanel>

      {/* Прогресс и достижения */}
      <TabPanel value={tabValue} index={3}>
        <ProgressAnalytics
          progressAnalytics={{
            averageCompletionTime: course.progressAnalytics?.averageCompletionTime || 0,
            dropoutPoints: course.progressAnalytics?.dropoutPoints || [],
            repeatUsers: course.progressAnalytics?.repeatUsers || 0,
            achievements: course.progressAnalytics?.achievements || [],
          }}
        />
      </TabPanel>

      {/* Социальная аналитика */}
      <TabPanel value={tabValue} index={4}>
        <SocialAnalytics
          socialAnalytics={{
            ratingDistribution: course.socialAnalytics?.ratingDistribution || {},
            reviewSentiment: course.socialAnalytics?.reviewSentiment || {
              positive: 0,
              neutral: 0,
              negative: 0,
            },
            favoriteCount: course.socialAnalytics?.favoriteCount || 0,
            recommendationEffectiveness: course.socialAnalytics?.recommendationEffectiveness || 0,
          }}
        />
      </TabPanel>

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

      {/* Модалка публичного профиля пользователя */}
      <UserPublicModal
        open={userModalOpen}
        username={selectedUsername}
        onClose={() => {
          setUserModalOpen(false);
          setSelectedUsername(null);
        }}
      />

      <Toast open={toastOpen} message={message} severity={severity} onClose={closeToast} />
    </Box>
  );
}

// Компонент для отображения прогресса пользователя с раскрывающимся блоком
function UserProgressAccordion({
  userCourse,
  courseId,
  onUsernameClick,
}: {
  userCourse: DetailedCourseStats["userCourses"][0];
  courseId: string;
  onUsernameClick: () => void;
}) {
  const [progress, setProgress] = useState<UserDetailedProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (expanded && !progress && !loading) {
      setLoading(true);
      setError(null);
      getUserProgress(courseId, userCourse.userId)
        .then((data) => {
          setProgress(data);
          setLoading(false);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Ошибка загрузки");
          setLoading(false);
        });
    }
  }, [expanded, courseId, userCourse.userId, progress, loading]);

  // Фильтруем дни, показывая только те, где есть активные шаги
  const activeDays =
    progress?.days.filter((day) => {
      const hasActiveSteps = day.steps.some(
        (step) =>
          step.status === TrainingStatus.IN_PROGRESS ||
          step.status === TrainingStatus.COMPLETED ||
          step.status === TrainingStatus.RESET,
      );
      return hasActiveSteps;
    }) || [];

  const handleChange = (_event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded);
  };

  return (
    <Accordion sx={{ mb: 1, maxWidth: "100%", overflow: "hidden" }} onChange={handleChange}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "flex-start", sm: "center" },
            gap: { xs: 1, sm: 2 },
            width: "100%",
            pr: { xs: 1, sm: 2 },
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: { xs: 1, sm: 2 },
              width: { xs: "100%", sm: "auto" },
              minWidth: 0,
              flex: { xs: "1 1 auto", sm: "0 0 auto" },
            }}
          >
            <Avatar
              sx={{ width: { xs: 32, sm: 40 }, height: { xs: 32, sm: 40 }, flexShrink: 0 }}
              src={userCourse.user.profile?.avatarUrl || "/uploads/avatar.svg"}
              alt={userCourse.user.username}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = "/uploads/avatar.svg";
              }}
            />
            <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <Typography
                variant="body1"
                fontWeight="bold"
                sx={{
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontSize: { xs: "0.875rem", sm: "1rem" },
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                color="text.primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onUsernameClick();
                }}
              >
                {userCourse.user.username}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
              >
                Статус:{" "}
                {userCourse.status === "COMPLETED"
                  ? "Завершил"
                  : userCourse.status === "IN_PROGRESS"
                    ? "В процессе"
                    : "Не начал"}
              </Typography>
            </Box>
          </Box>
          <Box
            sx={{
              textAlign: { xs: "left", sm: "right" },
              width: { xs: "100%", sm: "auto" },
              mt: { xs: 0.5, sm: 0 },
            }}
          >
            {userCourse.startedAt && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
              >
                Начал: {new Date(userCourse.startedAt).toLocaleDateString()}
              </Typography>
            )}
            {userCourse.completedAt && (
              <Typography
                variant="body2"
                color="success.main"
                sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
              >
                Завершил: {new Date(userCourse.completedAt).toLocaleDateString()}
              </Typography>
            )}
          </Box>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {error && (
          <Typography variant="body2" color="error" sx={{ py: 2 }}>
            Ошибка загрузки: {error}
          </Typography>
        )}
        {!loading && !error && progress && activeDays.length > 0 && (
          <Box sx={{ maxWidth: "100%", overflow: "hidden" }}>
            <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: "1rem", sm: "1.25rem" } }}>
              Детальный прогресс
            </Typography>
            {activeDays.map((day) => {
              const activeSteps = day.steps.filter(
                (step) =>
                  step.status === TrainingStatus.IN_PROGRESS ||
                  step.status === TrainingStatus.COMPLETED ||
                  step.status === TrainingStatus.RESET,
              );

              return (
                <Paper
                  key={day.dayOrder}
                  sx={{
                    p: { xs: 1.5, sm: 2 },
                    mb: 2,
                    maxWidth: "100%",
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: { xs: "column", sm: "row" },
                      alignItems: { xs: "flex-start", sm: "center" },
                      gap: { xs: 1, sm: 2 },
                      mb: 1,
                      flexWrap: "wrap",
                    }}
                  >
                    <Typography
                      variant="subtitle1"
                      fontWeight="bold"
                      sx={{
                        fontSize: { xs: "0.875rem", sm: "1rem" },
                        flex: 1,
                        minWidth: 0,
                        wordBreak: "break-word",
                      }}
                    >
                      День {day.dayOrder}: {day.dayTitle}
                    </Typography>
                    <Chip
                      label={
                        day.status === TrainingStatus.COMPLETED
                          ? "Завершен"
                          : day.status === TrainingStatus.IN_PROGRESS
                            ? "В процессе"
                            : day.status === TrainingStatus.RESET
                              ? "Сброшен"
                              : "Не начат"
                      }
                      color={
                        day.status === TrainingStatus.COMPLETED
                          ? "success"
                          : day.status === TrainingStatus.IN_PROGRESS
                            ? "warning"
                            : day.status === TrainingStatus.RESET
                              ? "default"
                              : "default"
                      }
                      size="small"
                      sx={{ flexShrink: 0 }}
                    />
                  </Box>
                  {day.dayCompletedAt && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 1, fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                    >
                      Завершен: {new Date(day.dayCompletedAt).toLocaleDateString()}
                    </Typography>
                  )}
                  {activeSteps.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Typography
                        variant="body2"
                        fontWeight="bold"
                        sx={{ mb: 1, fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                      >
                        Шаги:
                      </Typography>
                      {activeSteps.map((step) => (
                        <Box
                          key={step.stepOrder}
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: { xs: 0.5, sm: 1 },
                            mb: 1,
                            pl: { xs: 1, sm: 2 },
                            maxWidth: "100%",
                          }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              flexDirection: { xs: "column", sm: "row" },
                              alignItems: { xs: "flex-start", sm: "center" },
                              gap: { xs: 0.5, sm: 1 },
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{
                                flex: 1,
                                fontSize: { xs: "0.75rem", sm: "0.875rem" },
                                wordBreak: "break-word",
                                minWidth: 0,
                              }}
                            >
                              {step.stepOrder}. {step.stepTitle}
                            </Typography>
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: { xs: 0.5, sm: 1 },
                                flexWrap: "wrap",
                                flexShrink: 0,
                              }}
                            >
                              {step.status === TrainingStatus.COMPLETED && step.completedAt ? (
                                <Chip
                                  label={new Date(step.completedAt).toLocaleString("ru-RU", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                  color="success"
                                  size="small"
                                  sx={{ fontSize: { xs: "0.625rem", sm: "0.75rem" } }}
                                />
                              ) : (
                                <>
                                  <Chip
                                    label={
                                      step.status === TrainingStatus.IN_PROGRESS
                                        ? "В процессе"
                                        : step.status === TrainingStatus.RESET
                                          ? "Сброшен"
                                          : "Не начат"
                                    }
                                    color={
                                      step.status === TrainingStatus.IN_PROGRESS
                                        ? "warning"
                                        : step.status === TrainingStatus.RESET
                                          ? "default"
                                          : "default"
                                    }
                                    size="small"
                                    sx={{ fontSize: { xs: "0.625rem", sm: "0.75rem" } }}
                                  />
                                  {step.status === TrainingStatus.IN_PROGRESS && step.startedAt && (
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                      sx={{ fontSize: { xs: "0.625rem", sm: "0.75rem" } }}
                                    >
                                      Начат:{" "}
                                      {new Date(step.startedAt).toLocaleString("ru-RU", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </Typography>
                                  )}
                                </>
                              )}
                            </Box>
                          </Box>
                          {"diaryContent" in step && step.diaryContent && (
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: { xs: "0.75rem", sm: "0.8125rem" },
                                color: "text.secondary",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                pl: 1,
                                borderLeft: 2,
                                borderColor: "divider",
                              }}
                            >
                              {step.diaryContent}
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Box>
                  )}
                </Paper>
              );
            })}
          </Box>
        )}
        {!loading && !error && progress && activeDays.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            Пользователь еще не начал проходить курс
          </Typography>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
