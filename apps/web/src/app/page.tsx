import Image from "next/image";
import Link from "next/link";
import { generatePageMetadata } from "@gafus/metadata";

import styles from "./page.module.css";

export const metadata = generatePageMetadata({
  title: "Гафус — тренировки для собак от профессиональных кинологов",
  description:
    "Приложение для занятий с собакой: обучайтесь по урокам вашего кинолога, выполняйте задания каждый день, отслеживайте прогресс и получайте обратную связь.",
  path: "/",
});

export default function AuthPage() {
  return (
    <main className={styles.container}>
      <div className={styles.pawContainer}>
        <p className={styles.pawText}>гуляем</p>
        <Image src="/uploads/paw.svg" alt="paw" className={styles.paw} width={141} height={136} />
        <p className={styles.pawText}>вместе</p>
      </div>
      <h1 className={styles.title}>Гафус!</h1>
      <div className={styles.gafusdialog}>
        <Image
          src="/uploads/logo.png"
          alt="logo"
          className={styles.logo}
          width={250}
          height={250}
          priority
        />

        <div className={styles.speechBubble}>
          <p className={styles.speechText}>
            Добро ГАФ пожаловать!
            <br />
            Я - мудрый Гафус!
            <br />
            Я буду помогать тебе с тренировками!
            <br />
          </p>
        </div>
      </div>
      <div className={styles.buttonsContainer}>
        <Link href="/login">
          <button className={styles.button_login}>войти</button>
        </Link>
        <Link href="/register" prefetch={false}>
          <button className={styles.button_register}>регистрация</button>
        </Link>
      </div>
      <p className={styles.subtitle}>
        Умные пошаговые тренировки, отдых и обучение — всё в одном месте.
      </p>
    </main>
  );
}
