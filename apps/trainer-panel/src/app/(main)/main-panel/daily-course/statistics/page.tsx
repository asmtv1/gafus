import { redirect } from "next/navigation";

import { getMoscowDateKey } from "@gafus/core/services/dailyCourse";
import { getDailyCourseStatisticsPageData } from "@/features/daily-course/lib/actions";
import { getCachedSession } from "@/shared/lib/getSessionCached";
import DailyCourseStatisticsClient from "./DailyCourseStatisticsClient";

export default async function DailyCourseStatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; scheduleId?: string }>;
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
  const data = await getDailyCourseStatisticsPageData({
    from,
    to,
    scheduleId: params.scheduleId,
  });

  return (
    <DailyCourseStatisticsClient
      from={from}
      to={to}
      schedule={data.schedule}
      selectedScheduleId={data.selectedScheduleId}
      statistics={data.statistics}
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
