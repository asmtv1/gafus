import Image from "next/image";
import Link from "next/link";

import styles from "./login.module.css";
import LoginForm from "./LoginForm";

export const metadata = {
  title: "Страница входа пользователя",
  description: "Страница входа пользователя",
};

export default function LoginPage() {
  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Гафус!</h1>

      <Image src="/uploads/logo.png" alt="logo" className={styles.logo} width={303} height={303} priority unoptimized />
      
      <h2 className={styles.subtitle}>Авторизация</h2>
      <p className={styles.subtitle}>
        Если у Вас еще нет аккаунта -
        <Link href="/register" className={styles.link}>
          зарегистрируйтесь
        </Link>
        .
      </p>
      <LoginForm />
    </main>
  );
}
