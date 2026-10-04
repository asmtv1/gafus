import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { generateStaticPageMetadata } from "@gafus/metadata";

import AccountRemovalClientCleanup from "@shared/components/auth/AccountRemovalClientCleanup";

import styles from "./login.module.css";
import LoginForm from "./LoginForm";

export const metadata = generateStaticPageMetadata(
  "Вход",
  "Войдите в свой аккаунт для доступа к тренировкам и курсам.",
  "/login",
);

export default function LoginPage() {
  return (
    <main className={styles.container}>
      <h1 className="sr-only">Авторизация</h1>

      <Image
        src="/images/auth-login-wizard.png"
        alt="Авторизация — собака-волшебник"
        className={styles.logo}
        width={1125}
        height={1398}
        priority
      />

      <p className={styles.registerPrompt}>
        Если у Вас еще нет аккаунта -
        <Link href="/register" className={styles.link}>
          зарегистрируйтесь
        </Link>
        .
      </p>
      <Suspense fallback={null}>
        <AccountRemovalClientCleanup />
        <LoginForm />
      </Suspense>
    </main>
  );
}
