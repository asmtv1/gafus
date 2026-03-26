import Link from "next/link";
import { generateStaticPageMetadata } from "@gafus/metadata";

import { confirmEmailChangeByTokenAction } from "@shared/server-actions/auth";

export const metadata = generateStaticPageMetadata(
  "Подтверждение email",
  "Подтверждение нового адреса электронной почты",
  "/profile/confirm-email",
);

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";

  if (!token) {
    return (
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "2rem" }}>
        <h1>Неверная ссылка</h1>
        <p>Откройте полную ссылку из письма.</p>
        <Link href="/login">На главную</Link>
      </main>
    );
  }

  const result = await confirmEmailChangeByTokenAction(token);

  if (result.success) {
    return (
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "2rem" }}>
        <h1>Email обновлён</h1>
        <p>Новый адрес сохранён. Войдите с ним при следующем входе, если использовали email.</p>
        <Link href="/profile">В профиль</Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "2rem" }}>
      <h1>Не удалось подтвердить</h1>
      <p>{result.error}</p>
      <p>
        <Link href="/profile/change-email">Запросить новое письмо</Link>
      </p>
    </main>
  );
}
