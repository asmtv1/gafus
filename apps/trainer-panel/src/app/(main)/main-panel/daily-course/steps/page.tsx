import { getVisibleSteps } from "@/features/steps/lib/getVisibleSteps";
import { getCachedSession } from "@/shared/lib/getSessionCached";
import type { TrainerStepTableRow } from "@gafus/types";

import StepsClient from "../../steps/StepsClient";

export default async function DailyCourseStepsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    orderBy?: string;
    order?: string;
    page?: string;
    rowsPerPage?: string;
    onlyOrphanSteps?: string;
  }>;
}) {
  const [steps, params, session] = await Promise.all([
    getVisibleSteps({ isDailyCourse: true }),
    searchParams,
    getCachedSession(),
  ]);
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <StepsClient
      steps={steps as TrainerStepTableRow[]}
      isAdmin={isAdmin}
      title="Созданные шаги курса дня"
      subtitle="Шаги, созданные с включённой галочкой «Курс дня»"
      pagePath="/main-panel/daily-course/steps"
      enableCreateDayFromSteps={false}
      searchParams={params}
    />
  );
}
