import { redirect } from "next/navigation";

import { getMoscowDateKey } from "@gafus/core/services/dailyCourse";
import { getCachedSession } from "@/shared/lib/getSessionCached";
import { getDailyCoursePageData } from "@/features/daily-course/lib/actions";
import DailyCourseClient from "./DailyCourseClient";

export default async function DailyCoursePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const [session, params] = await Promise.all([getCachedSession(), searchParams]);
  if (!session?.user) {
    redirect("/login");
  }
  if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/main-panel");
  }

  const today = getMoscowDateKey();
  const from = isDateKey(params.from) ? params.from : today;
  const to = isDateKey(params.to) ? params.to : addDays(today, 29);
  const data = await getDailyCoursePageData({ from, to });

  return (
    <DailyCourseClient
      from={from}
      to={to}
      today={today}
      schedule={data.schedule}
      candidates={data.candidates}
    />
  );
}

function isDateKey(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
