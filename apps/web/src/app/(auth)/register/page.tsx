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
      <h1 className="sr-only">Регистрация</h1>
      <div className={styles.logoContainer}>
        <Image
          className={styles.logo}
          src="/images/auth-register-wizard.png"
          alt="Собака-волшебник"
          width={1312}
          height={1199}
          priority
        />
      </div>
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
    </main>
  );
}
