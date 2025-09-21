"use client";

import {
  Category,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Lock as LockIcon,
  Person,
  Public as PublicIcon,
  Star,
} from "@mui/icons-material";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import DayAnalytics from "./DayAnalytics";
import ProgressAnalytics from "./ProgressAnalytics";
import SocialAnalytics from "./SocialAnalytics";
import TimeAnalytics from "./TimeAnalytics";
import UserPublicModal from "./UserPublicModal";

import { Toast, useToast } from "@shared/components/ui/Toast";
import { deleteCourseServerAction } from "@shared/lib/actions/courses";

import {
  Avatar,
  Box,
  Button,
  Chip,
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

import type { DetailedCourseStats } from "@shared/types/statistics";

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
      console.error(e);
      showToast("Ошибка удаления курса", "error");
    }
  };

  return (
    <Box>
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
          <img
            src={course.logoImg || "/uploads/course-logo.webp"}
            alt={course.name}
            width={100}
            height={100}
            style={{ borderRadius: "8px" }}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = "/uploads/course-logo.webp";
            }}
          />
        </Avatar>

        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" component="h3" gutterBottom color="text.primary">
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
            <Typography variant="h6" gutterBottom color="primary">
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

        {/* Список пользователей с фильтрами */}
        {course.userCourses && course.userCourses.length > 0 && (
          <Box>
            <Typography variant="h6" gutterBottom color="text.primary">
              Пользователи курса
            </Typography>

            {/* Панель фильтров */}
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2, alignItems: "flex-end" }}>
              <FormControl size="small" sx={{ minWidth: 180 }}>
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
              />
              <TextField
                size="small"
                label="До"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />

              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="body2" color="text.secondary">Завершил</Typography>
                <Switch checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="body2" color="text.secondary">В процессе</Typography>
                <Switch checked={showInProgress} onChange={(e) => setShowInProgress(e.target.checked)} />
              </Box>
            </Box>

            <Box sx={{ maxHeight: 300, overflowY: "auto" }}>
              {course.userCourses
                .filter((uc) => {
                  const status = uc.status;
                  if (status === "COMPLETED" && !showCompleted) return false;
                  if (status === "IN_PROGRESS" && !showInProgress) return false;
                  if (dateFrom || dateTo) {
                    const dateValue = dateType === "started" ? uc.startedAt : uc.completedAt;
                    if (!dateValue) return false;
                    const dateMs = new Date(dateValue).getTime();
                    if (dateFrom) {
                      const fromMs = new Date(dateFrom).getTime();
                      if (dateMs < fromMs) return false;
                    }
                    if (dateTo) {
                      const toMs = new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1;
                      if (dateMs > toMs) return false;
                    }
                  }
                  return true;
                })
                .sort((a, b) => {
                  const getDate = (uc: typeof a) => (dateType === "started" ? uc.startedAt : uc.completedAt);
                  const da = getDate(a) ? new Date(getDate(a) as Date).getTime() : 0;
                  const db = getDate(b) ? new Date(getDate(b) as Date).getTime() : 0;
                  return db - da;
                })
                .map((userCourse, index: number) => (
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
                        <img
                          src={userCourse.user.profile?.avatarUrl || "/uploads/avatar.svg"}
                          alt={userCourse.user.username}
                          width={40}
                          height={40}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = "/uploads/avatar.svg";
                          }}
                        />
                      </Avatar>
                      <Box>
                        <Typography
                          variant="body1"
                          fontWeight="bold"
                          sx={{ cursor: "pointer", textDecoration: "underline" }}
                          color="text.primary"
                          onClick={() => {
                            setSelectedUsername(userCourse.user.username);
                            setUserModalOpen(true);
                          }}
                        >
                          {userCourse.user.username}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Статус:{" "}
                          {userCourse.status === "COMPLETED"
                            ? "Завершил"
                            : userCourse.status === "IN_PROGRESS"
                              ? "В процессе"
                              : "Не начал"}
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
              ))}
            </Box>
          </Box>
        )}

        {/* Отзывы */}
        {course.reviews && course.reviews.length > 0 && (
          <Box>
            <Typography variant="h6" gutterBottom color="text.primary">
              Последние отзывы
            </Typography>
            <Box sx={{ maxHeight: 260, overflowY: "auto" }}>
              {course.reviews.slice(0, 5).map((review, index: number) => (
                <Paper key={index} sx={{ p: 2, mb: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                    <Avatar sx={{ width: 40, height: 40 }}>
                      <img
                        src={review.user?.profile?.avatarUrl || "/uploads/avatar.svg"}
                        alt={review.user?.username || "user"}
                        width={40}
                        height={40}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = "/uploads/avatar.svg";
                        }}
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
            recommendationEffectiveness:
              course.socialAnalytics?.recommendationEffectiveness || 0,
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


