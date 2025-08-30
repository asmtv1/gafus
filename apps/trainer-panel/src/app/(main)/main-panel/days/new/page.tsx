import CreateDayClient from "@features/steps/components/CreateDayClient";
import { getVisibleSteps } from "@features/steps/lib/getVisibleSteps";

export default async function CreateDayPage() {
  const steps = await getVisibleSteps();

  // Убираем дубликаты по id, оставляя только уникальные шаги
  const uniqueSteps = steps.filter((step, index, self) => 
    index === self.findIndex(s => s.id === step.id)
  );

  const formattedSteps = uniqueSteps.map((step: { id: string | number; title: string }) => ({
    id: String(step.id),
    title: step.title,
  }));

  return <CreateDayClient allSteps={formattedSteps} />;
}
