import {
  Category,
  Edit as EditIcon,
  Lock as LockIcon,
  Person,
  Public as PublicIcon,
  Star,
  TrendingUp,
} from "@mui/icons-material";
import Image from "next/image";
import NextLink from "next/link";

import { Avatar, Box, Button, Card, CardContent, Chip, Typography } from "@/utils/muiImports";

import type { CourseStats } from "@shared/types/statistics";

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

interface CourseCardProps {
  course: CourseStats;
  onClick: () => void;
}

export default function CourseCard({ course, onClick }: CourseCardProps) {
  return (
    <Card
      onClick={onClick}
      sx={{
        mb: 3,
        cursor: "pointer",
        transition: "all 0.3s ease-in-out",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: 6,
        },
      }}
    >
      <CardContent sx={{ p: 3 }}>
        {/* Заголовок курса */}
        <Box sx={{ display: "flex", alignItems: "flex-start" }}>
          <Avatar
            sx={{
              width: 80,
              height: 80,
              mr: 2,
              borderRadius: 2,
            }}
          >
            <Image
              src={course.logoImg || "/uploads/course-logo.webp"}
              alt={course.name}
              width={80}
              height={80}
              style={{ borderRadius: "8px" }}
            />
          </Avatar>

          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" component="h3" gutterBottom>
              {course.name}
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Нажмите для просмотра детальной статистики
            </Typography>

            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <Chip
                icon={course.isPrivate ? <LockIcon /> : <PublicIcon />}
                label={course.isPrivate ? "Приватный" : "Публичный"}
                size="small"
                color={course.isPrivate ? "default" : "success"}
                variant="outlined"
              />
              {course.trainingLevel && (
                <Chip
                  icon={<TrendingUp />}
                  label={getTrainingLevelLabel(course.trainingLevel)}
                  size="small"
                  color={
                    getTrainingLevelColor(course.trainingLevel) as
                      | "default"
                      | "primary"
                      | "secondary"
                      | "success"
                      | "error"
                      | "info"
                      | "warning"
                  }
                  variant="outlined"
                />
              )}
              <Chip
                icon={<Person />}
                label={`${course.totalUsers || 0} пользователей`}
                size="small"
                color="primary"
                variant="outlined"
              />
              <Chip
                icon={<Category />}
                label={`${course.completedUsers || 0} завершили`}
                size="small"
                color="secondary"
                variant="outlined"
              />
              <Chip
                icon={<Star />}
                label={`${course.avgRating?.toFixed(1) || "0"} ★`}
                size="small"
                color="warning"
                variant="outlined"
              />
            </Box>

            <Box sx={{ mt: 2 }}>
              <Button
                component={NextLink}
                href={`/main-panel/courses/${course.id}/edit`}
                size="small"
                variant="contained"
                color="primary"
                startIcon={<EditIcon />}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                Редактировать курс
              </Button>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
