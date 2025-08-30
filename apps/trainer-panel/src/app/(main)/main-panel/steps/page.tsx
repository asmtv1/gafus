import StepsClient from "./StepsClient";

import { getVisibleSteps } from "@/features/steps/lib/getVisibleSteps";
import type { TrainerStepTableRow } from "@gafus/types";

export default async function StepsPage() {
  const steps = await getVisibleSteps();

  // Убираем дубликаты по id, оставляя только уникальные шаги
  const uniqueSteps = steps.filter((step, index, self) => 
    index === self.findIndex(s => s.id === step.id)
  );

  return <StepsClient steps={uniqueSteps as TrainerStepTableRow[]} />;
}
