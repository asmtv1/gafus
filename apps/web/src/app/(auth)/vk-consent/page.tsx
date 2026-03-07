import { Suspense } from "react";
import Image from "next/image";
import { VkConsentForm } from "./VkConsentForm";
import { generatePageMetadata } from "@gafus/metadata";

import styles from "../register/register.module.css";

export const metadata = generatePageMetadata({
  title: "Согласия — Гафус",
  description: "Подтвердите согласия для продолжения регистрации через VK",
  path: "/vk-consent",
});

export default function VkConsentPage() {
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
        <h2 className={styles.subtitle}>согласия</h2>
      </div>
      <p className={styles.info}>Для завершения регистрации через VK примите соглашения:</p>
      <Suspense fallback={null}>
        <VkConsentForm />
      </Suspense>
    </main>
  );
}
