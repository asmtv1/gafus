import { getVisibleDays } from "@features/courses/lib/getVisibleDays";

import DaysClient from "./DaysClient";

export default async function DaysPage() {
  const days = await getVisibleDays();
  return (
    <DaysClient
      days={days as unknown as { id: string; title: string; type: string; courseId: string }[]}
    />
  );
}
