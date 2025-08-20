import NewStepForm from "@features/steps/components/NewStepForm";
import { updateStep } from "@features/steps/lib/updateStep";
import { prisma } from "@gafus/prisma";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditStepPage({ params }: Props) {
  const { id } = await params;
  const step = await prisma.step.findUnique({ where: { id } });
  if (!step) return notFound();

  return (
    <div className="mx-auto mt-10 max-w-md rounded border p-4 shadow">
      <h1 className="mb-4 text-2xl font-bold">Редактировать шаг</h1>
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
    </div>
  );
}
