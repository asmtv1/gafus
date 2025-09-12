import NewStepForm from "@features/steps/components/NewStepForm";
import { updateStep } from "@features/steps/lib/updateStep";
import { prisma } from "@gafus/prisma";
import { notFound } from "next/navigation";
import FormPageLayout from "@shared/components/FormPageLayout";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditStepPage({ params }: Props) {
  const { id } = await params;
  const step = await prisma.step.findUnique({ where: { id } });
  if (!step) return notFound();

  return (
    <FormPageLayout 
      title="Редактирование шага тренировки"
      subtitle="Измените информацию о шаге тренировки"
    >
      <NewStepForm
        serverAction={updateStep}
        initialData={{
          id: step.id,
          title: step.title,
          description: step.description,
          durationSec: step.durationSec,
          videoUrl: step.videoUrl,
          imageUrls: step.imageUrls || [],
          pdfUrls: step.pdfUrls || [],
        }}
      />
    </FormPageLayout>
  );
}
