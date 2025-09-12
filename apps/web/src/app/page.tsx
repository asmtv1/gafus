import Image from "next/image";
import Link from "next/link";

import styles from "./page.module.css";

export const metadata = {
  title: "Гафус — тренировки с собакой",
  description: "Умные прогулки с собакой: тренировки по шагам, отдых и обучение — всё в одном.",
  openGraph: {
    title: "Гафус — тренировки с собакой",
    description:
      "Онлайн-платформа с пошаговыми тренировками, отдыхом и обучением для собак и их хозяев.",
    url: "https://gafus.ru",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "Гафус — тренировки с собакой",
      },
    ],
  },
};

export default function AuthPage() {
  return (
    <main className={styles.container}>
      <div className={styles.pawContainer}>
        <p className={styles.pawText}>гуляем</p>
        <Image src="/paw.svg" alt="paw" className={styles.paw} width={141} height={136} />
        <p className={styles.pawText}>вместе</p>
      </div>
      <h1 className={styles.title}>Гафус!</h1>
      <div className={styles.gafusdialog}>
      <Image src="/logo.png" alt="logo" className={styles.logo} width={303} height={303} priority />
      
      <div className={styles.speechBubble}>
        <p className={styles.speechText}>
        Добро ГАФ пожаловать!<br />
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
