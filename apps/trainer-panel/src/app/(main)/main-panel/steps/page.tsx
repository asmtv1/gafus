import StepsClient from "./StepsClient";

import { getVisibleSteps } from "@/features/steps/lib/getVisibleSteps";
import type { TrainerStepTableRow } from "@gafus/types";

export default async function StepsPage() {
  const steps = await getVisibleSteps();

  return <StepsClient steps={steps as TrainerStepTableRow[]} />;
}
