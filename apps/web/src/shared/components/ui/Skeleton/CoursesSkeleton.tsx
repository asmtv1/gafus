import React from "react";

import CourseCardSkeleton from "./CourseCardSkeleton";

interface CoursesSkeletonProps {
  count?: number;
}

export default function CoursesSkeleton({ count = 6 }: CoursesSkeletonProps) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {Array.from({ length: count }, (_, index) => (
        <CourseCardSkeleton key={index} />
      ))}
    </ul>
  );
}
