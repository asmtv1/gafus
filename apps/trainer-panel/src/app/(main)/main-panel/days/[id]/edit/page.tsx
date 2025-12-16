import CreateDayClient from "@features/steps/components/CreateDayClient";
import { getVisibleSteps } from "@features/steps/lib/getVisibleSteps";
import { prisma } from "@gafus/prisma";
import { notFound } from "next/navigation";
import FormPageLayout from "@shared/components/FormPageLayout";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditDayPage({ params }: Props) {
  const { id } = await params;
  if (!id) return notFound();

  const day = await prisma.trainingDay.findUnique({
    where: { id },
    include: { stepLinks: { orderBy: { order: "asc" } } },
  });
  if (!day) return null;

  const steps = await getVisibleSteps();

  const formattedSteps = steps.map((step: { id: string | number; title: string }) => ({
    id: String(step.id),
    title: step.title,
  }));

  return (
    <FormPageLayout 
      title="Редактирование дня тренировки"
      subtitle="Измените информацию о дне тренировки и выберите шаги"
    >
      <CreateDayClient
        allSteps={formattedSteps}
        initialDay={{
          id: day.id,
          title: day.title,
          type: day.type,
          description: day.description,
          equipment: day.equipment,
          stepIds: day.stepLinks.map((sl: { stepId: string }) => sl.stepId),
        }}
      />
    </FormPageLayout>
  );
}
