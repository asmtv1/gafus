import { LoadingState } from "@/shared/components/ui/LoadingState";
import Image from "next/image";
import { Suspense } from "react";
import { generatePageMetadata } from "@gafus/metadata";

import styles from "./passwordReset.module.css";
import { PasswordResetForm } from "./PasswordResetForm";

export const metadata = generatePageMetadata({
  title: "Сброс пароля",
  description: "Укажите email — пришлём письмо со ссылкой для сброса пароля.",
  path: "/passwordReset",
  noIndex: true, // Не индексировать служебную страницу
});
export const dynamic = "force-dynamic";

export default function PasswordResetPage() {
  return (
    <main className={styles.container}>
      <Image
        src="/uploads/paw.svg"
        alt="paw"
        className={styles.paw_absolute}
        width={141}
        height={136}
      />
      <Image
        src="/uploads/paw.svg"
        alt="paw"
        className={styles.paw_absolute_2}
        width={141}
        height={136}
      />
      <Image
        src="/uploads/paw.svg"
        alt="paw"
        className={styles.paw_absolute_3}
        width={141}
        height={136}
      />
      <Image
        src="/uploads/paw.svg"
        alt="paw"
        className={styles.paw_absolute_4}
        width={141}
        height={136}
      />
      <h1 className={styles.title}>Сброс пароля</h1>
      <p className={styles.subtitle}>
        Укажите email аккаунта. Если запросите новое письмо, ссылка из предыдущего перестанет
        работать.
      </p>
      <Suspense fallback={<LoadingState variant="inline" message="Загрузка формы…" />}>
        <PasswordResetForm />
      </Suspense>
      <Image
        className={styles.logo}
        src="/images/password-reset-wizard.png"
        alt="Собака-волшебник ищет пароль"
        width={1536}
        height={1024}
        priority
      />
      <Image
        className={styles.passwordReset_paw}
        src="/uploads/passwordReset_paw.png"
        alt="Logo"
        width={307}
        height={224}
        priority
      />
    </main>
  );
}
