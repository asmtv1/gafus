import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";
import StepsClient from "./StepsClient";

import { getVisibleSteps } from "@/features/steps/lib/getVisibleSteps";
import type { TrainerStepTableRow } from "@gafus/types";

export default async function StepsPage() {
  const session = await getServerSession(authOptions);
  const steps = await getVisibleSteps();
  const isAdmin = session?.user?.role === "ADMIN";

  return <StepsClient steps={steps as TrainerStepTableRow[]} isAdmin={isAdmin} />;
}
