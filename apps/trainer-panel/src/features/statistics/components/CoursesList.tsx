import { Analytics } from "@mui/icons-material";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import CourseCard from "./CourseCard";

import { Box, Paper, Typography } from "@/utils/muiImports";

import type { CourseStats } from "@gafus/statistics";

interface CoursesListProps {
  courses: CourseStats[];
  isAdmin?: boolean;
}

export default function CoursesList({ courses, isAdmin = false }: CoursesListProps) {
  const [courseItems, setCourseItems] = useState<CourseStats[]>(courses);
  const router = useRouter();

  useEffect(() => {
    setCourseItems(courses);
  }, [courses]);

  const handleCourseClick = (course: CourseStats) => {
    router.push(`/main-panel/statistics/courses/${course.id}`);
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
        {courseItems.map((course) => (
          <Box key={course.id} sx={{ flex: "1 1 400px", minWidth: 0 }}>
            <CourseCard
              course={course}
              onClick={() => handleCourseClick(course)}
              isAdmin={isAdmin}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
