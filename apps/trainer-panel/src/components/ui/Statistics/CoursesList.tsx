import CourseCard from "@features/statistics/components/CourseCard";
import CourseStatsModal from "@features/statistics/components/CourseStatsModal";
import { Analytics } from "@mui/icons-material";
import { getDetailedCourseStatisticsAction } from "@shared/lib/actions/statistics";
import { useEffect, useState } from "react";

import { Box, Paper, Skeleton, Typography } from "@/utils/muiImports";

import type { CourseStats, DetailedCourseStats } from "@shared/types/statistics";

interface CoursesListProps {
  courses: CourseStats[];
}

export default function CoursesList({ courses }: CoursesListProps) {
  const [courseItems, setCourseItems] = useState<CourseStats[]>(courses);
  const [selectedCourse, setSelectedCourse] = useState<DetailedCourseStats | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setCourseItems(courses);
  }, [courses]);

  const handleCourseClick = async (course: CourseStats) => {
    setIsLoading(true);
    try {
      const res = await getDetailedCourseStatisticsAction(course.id);
      if (res.success) {
        setSelectedCourse(res.data as DetailedCourseStats);
        setIsModalOpen(true);
      } else {
        setSelectedCourse(course as DetailedCourseStats);
        setIsModalOpen(true);
      }
    } catch (error) {
      console.error("Ошибка при получении детальной статистики:", error);
      // В случае ошибки показываем базовую статистику
      setSelectedCourse(course as DetailedCourseStats);
      setIsModalOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedCourse(null);
  };

  if (courseItems.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          Курсы не найдены
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Создайте свой первый курс, чтобы увидеть статистику
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
        <Analytics color="primary" />
        <Typography variant="h4" component="h2">
          Курсы
        </Typography>
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Paper key={i} sx={{ p: 2, flex: "1 1 400px", minWidth: 0 }}>
                <Skeleton variant="text" width={160} />
                <Skeleton variant="rounded" height={160} sx={{ my: 1 }} />
                <Skeleton variant="text" width="50%" />
              </Paper>
            ))
          : courseItems.map((course) => (
              <Box key={course.id} sx={{ flex: "1 1 400px", minWidth: 0 }}>
                <CourseCard course={course} onClick={() => handleCourseClick(course)} />
              </Box>
            ))}
      </Box>

      {selectedCourse && (
        <CourseStatsModal
          course={selectedCourse}
          open={isModalOpen}
          onClose={handleCloseModal}
          onDeleted={(deletedId) => {
            setCourseItems((prev) => prev.filter((c) => c.id !== deletedId));
            setIsModalOpen(false);
            setSelectedCourse(null);
          }}
        />
      )}
    </Box>
  );
}
