import { Suspense } from "react";
import ResetPasswordForm from "./reset-password-form";
import { Metadata } from "next";
export const metadata: Metadata = {
  title: "Сброс пароля",
  description: "Введите новый пароль для восстановления доступа к аккаунту.",
  robots: "noindex", // страница не должна индексироваться поисковиками
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p>Загрузка...</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
