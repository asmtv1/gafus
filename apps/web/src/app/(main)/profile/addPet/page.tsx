import { Suspense } from "react";
import { generateStaticPageMetadata } from "@gafus/metadata";
import LoadingScreen from "@shared/components/ui/LoadingScreen";

import AddPetForm from "./AddPetForm";

export const metadata = generateStaticPageMetadata(
  "Добавить питомца",
  "Добавьте информацию о вашем питомце, чтобы начать тренировки.",
  "/profile/addPet"
);

export default function AddPetFormPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AddPetForm />
    </Suspense>
  );
}
