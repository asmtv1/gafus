import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";
import { getVisibleDays } from "@features/courses/lib/getVisibleDays";

import DaysClient from "./DaysClient";

export default async function DaysPage() {
  const session = await getServerSession(authOptions);
  const days = await getVisibleDays();
  const isAdmin = session?.user?.role === "ADMIN";

  // Убираем дубликаты по id, оставляя только уникальные дни
  const uniqueDays = days.filter(
    (day, index, self) => index === self.findIndex((d) => d.id === day.id),
  );

  return (
    <DaysClient
      days={
        uniqueDays as unknown as { id: string; title: string; type: string; courseId: string }[]
      }
      isAdmin={isAdmin}
    />
  );
}
