import Link from "next/link";
import LoginForm from "@/app/(auth)/login/LoginForm";
import styles from "./login.module.css";
import Image from "next/image";
export const metadata = {
  title: "Страница входа пользователя",
  description: "Страница входа пользователя",
};
export default function LoginPage() {
  return (
    <main className={styles.container}>
      <Image
        className={styles.logo}
        src="/logo.png"
        alt="Logo"
        width={400}
        height={400}
        priority
      />
      <h1>Авторизация</h1>
      <LoginForm />
      <Link href="/passwordReset" style={{ marginTop: "1rem" }}>
        <button>Забыли пароль?</button>
      </Link>
    </main>
  );
}
