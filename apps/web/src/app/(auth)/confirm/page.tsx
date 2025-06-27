import { Suspense } from "react";
import ConfirmClient from "./ConfirmClient";
import Image from "next/image";
import Link from "next/link";
import styles from "./comfirm.module.css";

export const metadata = {
  title: "Подтверждение номера",
  description: "Подтвердите свой номер телефона для окончания регистрации",
};

export default function ConfirmPage() {
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
      <h1>Подтверждение номера</h1>
      <p>Пожалуйста, откройте Telegram-бота и подтвердите номер.</p>
      <Link href="https://t.me/dog_trainer_register_bot" target="_blank">
        <button className={styles.button}>Открыть Telegram-бота</button>
      </Link>

      <Suspense fallback={<p>Проверка подтверждения...</p>}>
        <ConfirmClient />
      </Suspense>
    </main>
  );
}
