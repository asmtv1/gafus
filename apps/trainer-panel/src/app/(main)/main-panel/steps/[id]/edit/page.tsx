import { getServerSession } from "next-auth";

import NewStepForm from "@features/steps/components/NewStepForm";
import { updateStep } from "@features/steps/lib/updateStep";
import { prisma } from "@gafus/prisma";
import { notFound } from "next/navigation";
import FormPageLayout from "@shared/components/FormPageLayout";
import { getTrainerVideos } from "@features/trainer-videos/lib/getTrainerVideos";
import { authOptions } from "@gafus/auth";
import type { ChecklistQuestion } from "@gafus/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditStepPage({ params }: Props) {
  const { id } = await params;
  const step = await prisma.step.findUnique({ where: { id } });
  if (!step) return notFound();

  const session = await getServerSession(authOptions);
  const trainerVideos = session?.user?.id ? await getTrainerVideos(session.user.id) : [];

  return (
    <FormPageLayout
      title="Редактирование шага тренировки"
      subtitle="Измените информацию о шаге тренировки"
    >
      <NewStepForm
        serverAction={updateStep}
        trainerVideos={trainerVideos}
        initialData={{
          id: step.id,
          title: step.title,
          description: step.description,
          durationSec: step.durationSec ?? undefined,
          estimatedDurationSec:
            (step as unknown as { estimatedDurationSec?: number | null }).estimatedDurationSec ??
            null,
          videoUrl: step.videoUrl,
          type: (step as unknown as { type?: string }).type || "TRAINING",
          imageUrls: step.imageUrls || [],
          pdfUrls: step.pdfUrls || [],
          checklist: Array.isArray((step as unknown as { checklist?: unknown }).checklist)
            ? (step as unknown as { checklist: ChecklistQuestion[] }).checklist
            : [],
          requiresVideoReport:
            (step as unknown as { requiresVideoReport?: boolean }).requiresVideoReport ?? false,
          requiresWrittenFeedback:
            (step as unknown as { requiresWrittenFeedback?: boolean }).requiresWrittenFeedback ??
            false,
          hasTestQuestions:
            (step as unknown as { hasTestQuestions?: boolean }).hasTestQuestions ?? false,
        }}
      />
    </FormPageLayout>
  );
}
