import { Suspense } from "react";

import AddPetForm from "./AddPetForm";

export const metadata = {
  title: "Добавить питомца",
  description: "Добавьте информацию о вашем питомце, чтобы начать тренировки.",
};

export default function AddPetFormPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <AddPetForm />
    </Suspense>
  );
}
