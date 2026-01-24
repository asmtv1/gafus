import Image from "next/image";
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
      <h1 className={styles.title}>Гафус!</h1>
      <div className={styles.logoContainer}>
        <Image
          className={styles.logo}
          src="/uploads/register-logo.png"
          alt="Logo"
          width={400}
          height={400}
          priority
        />
        <h2 className={styles.subtitle}>регистрация</h2>
      </div>
      <RegisterForm />
    </main>
  );
}
