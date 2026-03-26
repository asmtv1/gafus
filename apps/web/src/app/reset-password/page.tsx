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
    <main className={styles.container}>
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
        Перейдите по ссылке из письма или вставьте токен из ссылки и задайте новый пароль.
      </p>
      <Suspense fallback={<p className={styles.subtitle}>Загрузка...</p>}>
        <ResetPasswordWithToken searchParams={searchParams} />
      </Suspense>
      <Image
        className={styles.logo}
        src="/uploads/passwordReset-logo.png"
        alt=""
        width={307}
        height={224}
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
