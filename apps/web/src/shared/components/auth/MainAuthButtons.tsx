"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { VkIdOneTap } from "@shared/components/auth/VkIdOneTap";

import styles from "./MainAuthButtons.module.css";

const vkIdDebug =
  typeof window !== "undefined" &&
  (process.env.NODE_ENV === "development" ||
    /localhost|ngrok/i.test(window.location.hostname));

export function MainAuthButtons() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const vkToken = searchParams.get("vk_id_token");
    if (!vkToken) return;

    if (vkIdDebug) {
      console.log("[VK ID] MainAuthButtons: получен vk_id_token из URL, вызываем signIn...");
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("vk_id_token");
    const newUrl = params.toString() ? `${pathname}?${params}` : pathname;
    router.replace(newUrl, { scroll: false });

    signIn("credentials", {
      username: "__vk_id__",
      password: vkToken,
      redirect: false,
    }).then((res) => {
      if (res?.error) {
        alert("Ошибка авторизации VK ID");
      } else {
        window.location.href = "/courses";
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount when token present
  }, []);

  return (
    <div className={styles.buttonsContainer}>
      <Link href="/login">
        <button className={styles.button_login} type="button">
          войти
        </button>
      </Link>
      <Link href="/register" prefetch={false}>
        <button className={styles.button_register} type="button">
          регистрация
        </button>
      </Link>
      <VkIdOneTap />
    </div>
  );
}
