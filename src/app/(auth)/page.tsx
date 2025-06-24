import styles from "./page.module.css";
import Link from "next/link";
import Image from "next/image";
import ClientRedirectIfAuth from "@/components/ui/useRedirectIfAuth";
export const metadata = {
  title: "Гафус — тренировки с собакой",
  description:
    "Умные прогулки с собакой: тренировки по шагам, отдых и обучение — всё в одном.",
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
export default function HomePage() {
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

      <ClientRedirectIfAuth />
      <p className={styles.subtitle}>
        Умные прогулки с собакой: тренировки по шагам, отдых и обучение — всё в
        одном.
      </p>
      <Link href="/register" prefetch={false}>
        <button className={styles.button}>Зарегистрироваться</button>
      </Link>
      <Link href="/login">
        <button className={styles.button}>Авторизоваться</button>
      </Link>
    </main>
  );
}
