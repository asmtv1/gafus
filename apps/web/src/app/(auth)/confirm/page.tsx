import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import styles from "./confirm.module.css";
import ConfirmClient from "./ConfirmClient";

export const metadata = {
  title: "Подтверждение номера",
  description: "Подтвердите свой номер телефона для окончания регистрации",
};
export const dynamic = "force-dynamic";

export default function ConfirmPage() {
  return (
    <main className={styles.container}>
      <div className={styles.titleContainer}>
        <h1 className={styles.title}>Гафус!</h1>
        <Image
          className={styles.logo}
          src="/logo.png"
          alt="Logo"
          width={400}
          height={400}
          priority
        />
      </div>
      <h2 className={styles.subtitle}>Подтвердите номер</h2>
      <p className={styles.subtitle}>Откройте Telegram-бота и следуйте инструкциям.</p>
      <Link href="https://t.me/dog_trainer_register_bot" target="_blank">
        <button className={styles.button}>Открыть Telegram-бота</button>
      </Link>

      <Suspense fallback={<p>Проверка подтверждения...</p>}>
        <ConfirmClient />
      </Suspense>
      <Image
        className={styles.confirm_paw}
        src="/confirm_paw.png"
        alt="Logo"
        width={326}
        height={300}
        priority
      />
    </main>
  );
}
