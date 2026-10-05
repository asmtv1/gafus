import { LoadingState } from "@/shared/components/ui/LoadingState";
import Image from "next/image";
import { Suspense } from "react";
import { generatePageMetadata } from "@gafus/metadata";

import styles from "./reset-password.module.css";
import ResetPasswordForm from "./reset-password-form";

export const dynamic = "force-dynamic";

export const metadata = generatePageMetadata({
  title: "Сброс пароля",
  description: "Введите новый пароль для восстановления доступа к аккаунту.",
  path: "/reset-password",
  noIndex: true,
});

async function ResetPasswordWithToken({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  return <ResetPasswordForm initialToken={token} />;
}

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <main className={styles.container} data-app-background="auth">
      <Image
        src="/uploads/paw.svg"
        alt=""
        className={styles.paw_absolute}
        width={141}
        height={136}
        aria-hidden
      />
      <Image
        src="/uploads/paw.svg"
        alt=""
        className={styles.paw_absolute_2}
        width={141}
        height={136}
        aria-hidden
      />
      <Image
        src="/uploads/paw.svg"
        alt=""
        className={styles.paw_absolute_3}
        width={141}
        height={136}
        aria-hidden
      />
      <Image
        src="/uploads/paw.svg"
        alt=""
        className={styles.paw_absolute_4}
        width={141}
        height={136}
        aria-hidden
      />
      <h1 className={styles.title}>Сброс пароля</h1>
      <p className={styles.subtitle}>
        Откройте последнее письмо со ссылкой или вставьте токен из него и задайте новый пароль.
      </p>
      <Suspense fallback={<LoadingState variant="inline" size="small" message="Загрузка формы…" />}>
        <ResetPasswordWithToken searchParams={searchParams} />
      </Suspense>
      <Image
        className={styles.logo}
        src="/images/password-reset-wizard.png"
        alt=""
        width={1536}
        height={1024}
        priority
        aria-hidden
      />
      <Image
        className={styles.passwordReset_paw}
        src="/uploads/passwordReset_paw.png"
        alt=""
        width={307}
        height={224}
        priority
        aria-hidden
      />
    </main>
  );
}
