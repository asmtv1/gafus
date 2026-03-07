"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useZodForm } from "@shared/hooks/useZodForm";
import { submitVkConsentAction } from "@shared/server-actions";
import { vkConsentFormSchema } from "@shared/lib/validation/authSchemas";
import type { ConsentPayload } from "@shared/constants/consent";

import styles from "../register/register.module.css";

export function VkConsentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const vkToken = searchParams.get("vk_id_token");

  const {
    form,
    handleSubmit,
    setError,
    formState: { errors, isValid },
  } = useZodForm(vkConsentFormSchema, {
    acceptPersonalData: false,
    acceptPrivacyPolicy: false,
    acceptDataDistribution: false,
  });

  const [isPending, setIsPending] = useState(false);

  if (!vkToken) {
    return (
      <div className={styles.form}>
        <p className={styles.info}>Ссылка устарела или недействительна.</p>
        <Link href="/" className={styles.checkboxLink}>
          Вернуться на главную
        </Link>
      </div>
    );
  }

  const onSubmit = async (data: ConsentPayload) => {
    setIsPending(true);
    try {
      const result = await submitVkConsentAction(vkToken, data);
      if (result.success) {
        const res = await signIn("credentials", {
          username: "__vk_id__",
          password: vkToken,
          redirect: false,
        });
        if (res?.error) {
          router.replace("/login?error=vk_id_auth_failed");
        } else {
          router.replace("/courses", { scroll: false });
          router.refresh();
        }
      } else {
        setError("acceptPersonalData", { message: result.error });
        setIsPending(false);
      }
    } catch {
      setError("acceptPersonalData", { message: "Ошибка. Попробуйте снова." });
      setIsPending(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)}>
      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          {...form.register("acceptPersonalData")}
          aria-invalid={!!errors.acceptPersonalData}
        />
        <span className={styles.checkboxLabel}>
          Даю{" "}
          <Link
            href="/personal.html"
            className={styles.checkboxLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            согласие на обработку персональных данных
          </Link>
        </span>
      </label>
      {errors.acceptPersonalData?.message && (
        <span className={styles.errorText}>{errors.acceptPersonalData.message}</span>
      )}

      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          {...form.register("acceptPrivacyPolicy")}
          aria-invalid={!!errors.acceptPrivacyPolicy}
        />
        <span className={styles.checkboxLabel}>
          Ознакомлен(а) с{" "}
          <Link
            href="/policy.html"
            className={styles.checkboxLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            Политикой конфиденциальности
          </Link>
        </span>
      </label>
      {errors.acceptPrivacyPolicy?.message && (
        <span className={styles.errorText}>{errors.acceptPrivacyPolicy.message}</span>
      )}

      <label className={styles.checkboxRow}>
        <input type="checkbox" {...form.register("acceptDataDistribution")} />
        <span className={styles.checkboxLabel}>
          Даю{" "}
          <Link
            href="/personal-distribution.html"
            className={styles.checkboxLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            согласие на размещение данных в публичном профиле
          </Link>
        </span>
      </label>
      {errors.acceptDataDistribution?.message && (
        <span className={styles.errorText}>{errors.acceptDataDistribution.message}</span>
      )}

      <button className={styles.button} type="submit" disabled={isPending || !isValid}>
        {isPending ? "Сохранение..." : "Принять и продолжить"}
      </button>
    </form>
  );
}
