import { Suspense } from "react";

import AddPetForm from "./AddPetForm";

export const metadata = {
  title: "Добавить питомца",
  description: "Добавьте информацию о вашем питомце, чтобы начать тренировки.",
};

export default function AddPetFormPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <main style={{ maxWidth: "600px", margin: "0 auto", padding: "2rem" }}>
        <h1>Добавить питомца</h1>
        <AddPetForm />
      </main>
    </Suspense>
  );
}
