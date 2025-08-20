import NewStepForm from "@features/steps/components/NewStepForm";
import { createStep } from "@features/steps/lib/createStep";

export default function NewStepPage() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded border p-4 shadow">
      <h1 className="mb-4 text-2xl font-bold">Создать шаг</h1>
      <NewStepForm serverAction={createStep} />
    </div>
  );
}
