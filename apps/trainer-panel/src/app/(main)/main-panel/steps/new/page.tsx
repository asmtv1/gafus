import NewStepForm from "@features/steps/components/NewStepForm";
import { createStep } from "@features/steps/lib/createStep";
import FormPageLayout from "@shared/components/FormPageLayout";

export default function NewStepPage() {
  return (
    <FormPageLayout 
      title="Создание шага тренировки"
      subtitle="Заполните информацию о новом шаге тренировки"
    >
      <NewStepForm serverAction={createStep} />
    </FormPageLayout>
  );
}
