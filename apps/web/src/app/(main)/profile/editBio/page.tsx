// app/profile/EditBioForm/page.tsx

import { generateStaticPageMetadata } from "@gafus/metadata";
import EditBioForm from "./EditBioForm";

export const metadata = generateStaticPageMetadata(
  "Редактировать профиль",
  "Редактирование информации о себе",
  "/profile/editBio"
);

export default function EditBioFormPage() {
  return (
    <EditBioForm />
  );
}
