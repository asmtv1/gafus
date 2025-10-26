import { Suspense } from "react";
import { generateStaticPageMetadata } from "@gafus/metadata";

import AddPetForm from "./AddPetForm";

export const metadata = generateStaticPageMetadata(
  "Добавить питомца",
  "Добавьте информацию о вашем питомце, чтобы начать тренировки.",
  "/profile/addPet"
);

export default function AddPetFormPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <AddPetForm />
    </Suspense>
  );
}
