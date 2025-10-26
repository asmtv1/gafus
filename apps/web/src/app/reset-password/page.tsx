import { Suspense } from "react";
import { generatePageMetadata } from "@gafus/metadata";

import ResetPasswordForm from "./reset-password-form";

export const dynamic = "force-dynamic";

export const metadata = generatePageMetadata({
  title: "Сброс пароля",
  description: "Введите новый пароль для восстановления доступа к аккаунту.",
  path: "/reset-password",
  noIndex: true, // Страница не должна индексироваться поисковиками
});

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p>Загрузка...</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
