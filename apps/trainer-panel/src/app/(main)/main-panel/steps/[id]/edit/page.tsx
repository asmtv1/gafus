import NewStepForm from "@features/steps/components/NewStepForm";
import { updateStep } from "@features/steps/lib/updateStep";
import { getStepForEdit } from "@gafus/core/services/trainerStep";
import { notFound } from "next/navigation";

import FormPageLayout from "@shared/components/FormPageLayout";
import { getTrainerVideos } from "@features/trainer-videos/lib/getTrainerVideos";
import { getCachedSession } from "@/shared/lib/getSessionCached";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditStepPage({ params }: Props) {
  const { id } = await params;
  const [step, session] = await Promise.all([
    getStepForEdit(id),
    getCachedSession(),
  ]);
  if (!step) return notFound();

  const trainerVideos = session?.user?.id ? await getTrainerVideos(session.user.id) : [];

  return (
    <FormPageLayout
      title="Редактирование шага тренировки"
      subtitle="Измените информацию о шаге тренировки"
    >
      <NewStepForm
        serverAction={updateStep}
        trainerVideos={trainerVideos}
        initialData={step}
      />
    </FormPageLayout>
  );
}
