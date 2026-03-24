import { getVisibleSteps } from "@/features/steps/lib/getVisibleSteps";
import { getCachedSession } from "@/shared/lib/getSessionCached";
import type { TrainerStepTableRow } from "@gafus/types";

import StepsClient from "./StepsClient";

export default async function StepsPage({
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
  const [steps, params] = await Promise.all([getVisibleSteps(), searchParams]);
  const session = await getCachedSession();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <StepsClient steps={steps as TrainerStepTableRow[]} isAdmin={isAdmin} searchParams={params} />
  );
}
