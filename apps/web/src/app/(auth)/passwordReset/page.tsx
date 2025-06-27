import { Suspense } from "react";
import { PasswordResetClient } from "./PasswordResetForm";

export const metadata = {
  title: "Смена пароля",
  description: "Введите логин и номер телефона для восстановления доступа.",
};

export default function PasswordResetPage() {
  return (
    <main style={{ maxWidth: "400px", margin: "0 auto", padding: "2rem" }}>
      <h1>Сброс пароля</h1>
      <Suspense fallback={<p>Загрузка...</p>}>
        <PasswordResetClient />
      </Suspense>
    </main>
  );
}
