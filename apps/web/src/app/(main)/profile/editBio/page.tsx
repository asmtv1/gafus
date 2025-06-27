// app/profile/EditBioForm/page.tsx

import EditBioForm from "./EditBioForm";

export const metadata = {
  title: "Редактировать профиль",
  description: "Редактирование информации о себе",
};
export default function EditBioFormPage() {
  return (
    <main style={{ maxWidth: "600px", margin: "0 auto", padding: "2rem" }}>
      <EditBioForm />
    </main>
  );
}
