import CreateDayClient from "@features/steps/components/CreateDayClient";
import { getVisibleSteps } from "@features/steps/lib/getVisibleSteps";
import FormPageLayout from "@shared/components/FormPageLayout";

export default async function CreateDayPage({
  searchParams,
}: {
  searchParams: Promise<{ stepIds?: string | string[] }>;
}) {
  const steps = await getVisibleSteps();
  const params = await searchParams;
  const stepIdsParam = params.stepIds;
  const initialStepIds = Array.isArray(stepIdsParam)
    ? stepIdsParam
    : stepIdsParam
      ? [stepIdsParam]
      : undefined;

  const formattedSteps = steps.map((step: { id: string | number; title: string }) => ({
    id: String(step.id),
    title: step.title,
  }));

  return (
    <FormPageLayout
      title="Создание дня тренировки"
      subtitle="Заполните информацию о новом дне тренировки и выберите шаги"
    >
      <CreateDayClient allSteps={formattedSteps} initialStepIds={initialStepIds} />
    </FormPageLayout>
  );
}
