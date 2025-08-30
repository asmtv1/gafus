import { getVisibleDays } from "@features/courses/lib/getVisibleDays";

import DaysClient from "./DaysClient";

export default async function DaysPage() {
  const days = await getVisibleDays();
  
  // Убираем дубликаты по id, оставляя только уникальные дни
  const uniqueDays = days.filter((day, index, self) => 
    index === self.findIndex(d => d.id === day.id)
  );
  
  return (
    <DaysClient
      days={uniqueDays as unknown as { id: string; title: string; type: string; courseId: string }[]}
    />
  );
}
