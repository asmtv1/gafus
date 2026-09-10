import { notFound, redirect } from "next/navigation";

import { DAILY_COURSE_LOGO, generatePageMetadata } from "@gafus/metadata";
import { getDailyCourseTrainingForWeb } from "@shared/lib/daily-course/actions";

import { DailyCourseDayClient } from "./DailyCourseDayClient";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export default async function DailyCoursePage(props: {
  params: Promise<{ scheduleId: string }>;
}) {
  const { scheduleId } = await props.params;
  let training = null;
  try {
    training = await getDailyCourseTrainingForWeb(scheduleId);
  } catch (error) {
    if (error instanceof Error && error.message === "Пользователь не авторизован") {
      redirect("/login");
    }
    throw error;
  }

  if (!training) {
    notFound();
  }

  return <DailyCourseDayClient scheduleId={scheduleId} training={training} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata({
    title: "Курс дня",
    description: "Ежедневная связка упражнений.",
    path: "/daily-course",
    image: DAILY_COURSE_LOGO.url,
    imageWidth: DAILY_COURSE_LOGO.width,
    imageHeight: DAILY_COURSE_LOGO.height,
    imageAlt: DAILY_COURSE_LOGO.alt,
  });
}
