import Image from "next/image";

import styles from "./register.module.css";

import { RegisterForm } from "@/app/(auth)/register/RegisterForm";

export const metadata = {
  title: "Страница регистрации пользователя",
  description: "Страница регистрации пользователя",
};
export default function RegisterPage() {
  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Гафус!</h1>
      <Image
        className={styles.logo}
        src="/register-logo.png"
        alt="Logo"
        width={400}
        height={400}
        priority
      />
      <h2 className={styles.subtitle}>регистрация</h2>
      <RegisterForm />
    </main>
  );
}
