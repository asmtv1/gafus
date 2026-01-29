"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button, Typography } from "@mui/material";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOfflineStore } from "@shared/stores/offlineStore";
import { useCourseCompletionCelebration } from "@shared/hooks/useCourseCompletionCelebration";

import { PaidCourseDrawer, type PaidCourseDrawerCourse } from "@/features/courses/components/PaidCourseDrawer";
import { showPaidCourseAccessAlert } from "@shared/utils/sweetAlert";
import CourseDescriptionWithVideo from "../CourseDescriptionWithVideo";
import TrainingDayList from "../TrainingDayList";

interface TrainingPageClientProps {
  courseType: string;
  courseName?: string;
  initialData?: {
    trainingDays: {
      trainingDayId: string;
      dayOnCourseId: string;
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
  accessDenied?: boolean;
  accessDeniedReason?: "private" | "paid" | null;
  courseForPay?: PaidCourseDrawerCourse | null;
  userId?: string;
}

const accessDeniedBlockStyle = {
  padding: 24,
  textAlign: "center" as const,
  background: "var(--mui-palette-action-hover)",
  borderRadius: 12,
};

export default function TrainingPageClient({
  courseType,
  courseName,
  initialData,
  initialError,
  accessDenied = false,
  accessDeniedReason = null,
  courseForPay = null,
  userId,
}: TrainingPageClientProps) {
  const _online = useOfflineStore((s) => s.isOnline);
  const [payDrawerOpen, setPayDrawerOpen] = useState(false);
  const router = useRouter();
  const paidSwalShownRef = useRef(false);

  useCourseCompletionCelebration({
    courseId: initialData?.courseId || "",
    courseType,
    trainingDays: initialData?.trainingDays,
  });

  const isAccessDenied =
    accessDenied || initialError === "COURSE_ACCESS_DENIED";

  const showPaidSwal = accessDeniedReason === "paid" && courseForPay;
  useEffect(() => {
    if (!showPaidSwal || paidSwalShownRef.current || !courseForPay) return;
    paidSwalShownRef.current = true;
    void showPaidCourseAccessAlert(
      { name: courseForPay.name, priceRub: courseForPay.priceRub },
      () => setPayDrawerOpen(true),
      () => router.push("/courses"),
    );
  }, [showPaidSwal, courseForPay, router]);

  if (isAccessDenied) {
    if (accessDeniedReason === "paid" && courseForPay) {
      return (
        <>
          {!payDrawerOpen && (
            <div style={accessDeniedBlockStyle}>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Курс платный. Оплатите для доступа к занятиям.
              </Typography>
              <Button component={Link} href="/courses" variant="contained">
                Назад к курсам
              </Button>
            </div>
          )}
          <PaidCourseDrawer
            open={payDrawerOpen}
            course={courseForPay}
            onClose={() => setPayDrawerOpen(false)}
            userId={userId}
          />
        </>
      );
    }
    if (accessDeniedReason === "private") {
      return (
        <div style={accessDeniedBlockStyle}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Курс недоступен 🔒
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Этот курс приватный и доступен только по приглашению. Обратитесь к
            кинологу для получения доступа.
          </Typography>
          <Button component={Link} href="/courses" variant="contained">
            Назад к курсам
          </Button>
        </div>
      );
    }
    return (
      <div style={accessDeniedBlockStyle}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Доступ закрыт
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          У вас нет доступа к этому курсу.
        </Typography>
        <Button component={Link} href="/courses" variant="contained">
          Назад к курсам
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="courseDescription">
        <CourseDescriptionWithVideo
          description={initialData?.courseDescription || null}
          videoUrl={initialData?.courseVideoUrl || null}
          equipment={initialData?.courseEquipment || null}
          trainingLevel={initialData?.courseTrainingLevel || null}
          courseName={courseName}
          courseType={courseType}
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
