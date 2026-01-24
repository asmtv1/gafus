import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";
import StepsClient from "./StepsClient";

import { getVisibleSteps } from "@/features/steps/lib/getVisibleSteps";
import type { TrainerStepTableRow } from "@gafus/types";

export default async function StepsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    orderBy?: string;
    order?: string;
    page?: string;
    rowsPerPage?: string;
  }>;
}) {
  const session = await getServerSession(authOptions);
  const steps = await getVisibleSteps();
  const isAdmin = session?.user?.role === "ADMIN";
  const params = await searchParams;

  return (
    <StepsClient steps={steps as TrainerStepTableRow[]} isAdmin={isAdmin} searchParams={params} />
  );
}
