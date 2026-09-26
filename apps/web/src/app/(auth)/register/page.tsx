import Image from "next/image";
import { Suspense } from "react";
import { generateStaticPageMetadata } from "@gafus/metadata";

import styles from "./register.module.css";

import { RegisterForm } from "@/app/(auth)/register/RegisterForm";

export const metadata = generateStaticPageMetadata(
  "Регистрация",
  "Создайте аккаунт для доступа к профессиональным тренировкам для собак.",
  "/register",
);
export default function RegisterPage() {
  return (
    <main className={styles.container}>
      <div className={styles.logoContainer}>
        <Image
          className={styles.logo}
          src="/images/register-wizard.png"
          alt="Собака-волшебник"
          width={1374}
          height={1145}
          priority
        />
        <h2 className={styles.subtitle}>регистрация</h2>
      </div>
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
    </main>
  );
}
