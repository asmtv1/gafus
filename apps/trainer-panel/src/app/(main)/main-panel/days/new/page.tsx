import CreateDayClient from "@features/steps/components/CreateDayClient";
import { getVisibleSteps } from "@features/steps/lib/getVisibleSteps";

export default async function CreateDayPage() {
  const steps = await getVisibleSteps();

  const formattedSteps = steps.map((step) => ({
    id: String(step.id),
    title: step.title,
  }));

  return <CreateDayClient allSteps={formattedSteps} />;
}
