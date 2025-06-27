"use client";

import { CourseCard } from "@/components/CourseCard/CourseCard";
import { useState, useEffect } from "react";
import { Course as CourseType } from "@/types/course";

type Course = Omit<CourseType, "description"> & {
  startedAt?: Date | null;
  completedAt?: Date | null;
  onUnfavorite?: () => void;
};

type FavoritesListProps = {
  initialCourses: Course[];
};

export function FavoritesList({ initialCourses }: FavoritesListProps) {
  const [courses, setCourses] = useState(initialCourses);
  const [error, setError] = useState<Error | null>(null);

  const handleUnfavorite = (id: number) => {
    setCourses((prev) => prev.filter((course) => course.id !== id));
  };

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  return (
    <>
      {courses.length === 0 ? (
        <p>Курсы не найдены</p>
      ) : (
        (() => {
          try {
            return courses.map((course) => (
              <CourseCard
                key={course.id}
                {...course}
                onUnfavorite={() => handleUnfavorite(course.id)}
              />
            ));
          } catch (err) {
            const e = err instanceof Error ? err : new Error("Unknown error");
            setError(e);
            return null;
          }
        })()
      )}
    </>
  );
}
