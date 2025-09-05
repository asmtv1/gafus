"use client";

import React from "react";

import CourseDescriptionWithVideo from "./CourseDescriptionWithVideo";
import TrainingDayList from "./TrainingDayList";

interface TrainingPageClientProps {
  courseType: string;
  courseDescription: string | null;
  courseVideoUrl: string | null;
}

export default function TrainingPageClient({ 
  courseType, 
  courseDescription, 
  courseVideoUrl 
}: TrainingPageClientProps) {
  return (
    <>
      <div className="courseDescription">
        <CourseDescriptionWithVideo 
          description={courseDescription} 
          videoUrl={courseVideoUrl} 
        />
      </div>

      <h3 className="plan">План занятий:</h3>
      <TrainingDayList 
        courseType={courseType} 
      />
    </>
  );
}
