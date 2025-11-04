import Image from "next/image";
import { Suspense } from "react";
import { generatePageMetadata } from "@gafus/metadata";
import LoadingScreen from "@shared/components/ui/LoadingScreen";

import styles from "./passwordReset.module.css";
import { PasswordResetForm } from "./PasswordResetForm";

export const metadata = generatePageMetadata({
  title: "Сброс пароля",
  description: "Введите логин и номер телефона для восстановления доступа к аккаунту.",
  path: "/passwordReset",
  noIndex: true, // Не индексировать служебную страницу
});
export const dynamic = "force-dynamic";

export default function PasswordResetPage() {
  return (
    <main className={styles.container}>
      <Image src="/uploads/paw.svg" alt="paw" className={styles.paw_absolute} width={141} height={136} />
      <Image src="/uploads/paw.svg" alt="paw" className={styles.paw_absolute_2} width={141} height={136} />
      <Image src="/uploads/paw.svg" alt="paw" className={styles.paw_absolute_3} width={141} height={136} />
      <Image src="/uploads/paw.svg" alt="paw" className={styles.paw_absolute_4} width={141} height={136} />
      <h1 className={styles.title}>Сброс пароля</h1>
      <p className={styles.subtitle}>Введите логин и номер телефона для восстановления доступа.</p>
      <Suspense fallback={<LoadingScreen />}>
        <PasswordResetForm />
      </Suspense>
      <Image
        className={styles.logo}
        src="/uploads/passwordReset-logo.png"
        alt="Logo"
        width={307}
        height={224}
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
