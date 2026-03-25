import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";
import { generateStaticPageMetadata } from "@gafus/metadata";

import DeleteAccountForm from "@features/profile/components/DeleteAccountForm";

export const metadata = generateStaticPageMetadata(
  "Удаление аккаунта",
  "Необратимое удаление учётной записи и данных",
  "/profile/delete-account",
);

export default async function DeleteAccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (session.user.passwordSetAt == null) {
    redirect("/profile/set-password");
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "2rem" }}>
      <h1>Удаление аккаунта</h1>
      <p style={{ marginBottom: "0.75rem", color: "var(--mui-palette-text-secondary)" }}>
        Действие <strong>необратимо</strong>. Восстановление данных и входа будет невозможно. После
        удаления все сессии (включая этот браузер) перестанут работать.
      </p>
      <p style={{ marginBottom: "0.5rem", fontWeight: 600 }}>Будут удалены или обезличены:</p>
      <ul
        style={{
          margin: "0 0 1rem 1.25rem",
          color: "var(--mui-palette-text-secondary)",
          lineHeight: 1.5,
        }}
      >
        <li>профиль и настройки;</li>
        <li>прогресс тренировок и связанные данные обучения (в пределах каскада БД);</li>
        <li>push-подписки и напоминания;</li>
        <li>сессии и токены обновления (JWT).</li>
      </ul>
      <p style={{ fontSize: "0.9rem", color: "#c62828", marginBottom: "0.5rem" }}>
        Введите текущий пароль и нажмите кнопку ниже, чтобы подтвердить удаление навсегда.
      </p>
      <DeleteAccountForm />
    </main>
  );
}
