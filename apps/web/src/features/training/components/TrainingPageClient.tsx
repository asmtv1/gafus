"use client";

import React from "react";
import { useOfflineStore } from "@shared/stores/offlineStore";

import CourseDescriptionWithVideo from "./CourseDescriptionWithVideo";
import TrainingDayList from "./TrainingDayList";

interface TrainingPageClientProps {
  courseType: string;
  initialData?: {
    trainingDays: {
      trainingDayId: string;
      day: number;
      title: string;
      type: string;
      courseId: string;
      userStatus: string;
    }[];
    courseDescription: string | null;
    courseId: string | null;
    courseVideoUrl: string | null;
    courseEquipment: string | null;
    courseTrainingLevel: string | null;
  } | null;
  initialError?: string | null;
}

export default function TrainingPageClient({ 
  courseType, 
  initialData,
  initialError
}: TrainingPageClientProps) {
  const _online = useOfflineStore((s) => s.isOnline);

  return (
    <>
      
      <div className="courseDescription">
        <CourseDescriptionWithVideo 
          description={initialData?.courseDescription || null} 
          videoUrl={initialData?.courseVideoUrl || null}
          equipment={initialData?.courseEquipment || null}
          trainingLevel={initialData?.courseTrainingLevel || null}
        />
      </div>

      <h3 className="plan">План занятий:</h3>
      <TrainingDayList 
        courseType={courseType}
        initialData={initialData}
        initialError={initialError}
      />
    </>
  );
}
