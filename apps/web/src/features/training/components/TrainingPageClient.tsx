"use client";

import React, { useEffect, useState } from "react";

import CourseDescriptionWithVideo from "./CourseDescriptionWithVideo";
import TrainingDayList from "./TrainingDayList";
import { OfflineTimerTest } from "./OfflineTimerTest";
import { CacheTester } from "@shared/components/ui/CacheTester";

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
  } | null;
  initialError?: string | null;
}

export default function TrainingPageClient({ 
  courseType, 
  initialData,
  initialError
}: TrainingPageClientProps) {
  const [_isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Проверяем онлайн статус
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Проверяем текущий статус
    setIsOnline(navigator.onLine);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <>
      {/* Тестовые компоненты - только в development */}
      {process.env.NODE_ENV === "development" && (
        <>
          <CacheTester />
          {initialData?.courseId && (
            <OfflineTimerTest
              courseId={initialData.courseId}
              day={1}
              stepIndex={0}
              durationSec={60} // 1 минута для тестирования
            />
          )}
        </>
      )}
      
      <div className="courseDescription">
        <CourseDescriptionWithVideo 
          description={initialData?.courseDescription || null} 
          videoUrl={initialData?.courseVideoUrl || null} 
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
