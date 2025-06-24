"use client";

import { useForm } from "react-hook-form";
import { useState } from "react";
import { registerUser } from "@/lib/auth/registerUser";
import { FormField } from "@/components/ui/FormField";
import { PasswordInput } from "@/components/ui/PasswordInput";
import styles from "./register.module.css";
import parsePhoneNumberFromString from "libphonenumber-js";

import { useRouter } from "next/navigation";

type FormData = {
  name: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

export default function RegisterForm() {
  const router = useRouter();

  const form = useForm<FormData>({ mode: "onBlur" });
  const {
    handleSubmit,
    setError,
    getValues,
    formState: { errors },
  } = form;

  const [isPending, setIsPending] = useState(false);
  const [caughtError, setCaughtError] = useState<Error | null>(null);
  if (caughtError) {
    throw caughtError;
  }

  const onSubmit = async (data: FormData) => {
    const phoneNumber = parsePhoneNumberFromString(data.phone, "RU");

    if (!phoneNumber || !phoneNumber.isValid()) {
      setError("phone", { message: "Неверный номер телефона" });
      return;
    }

    const formattedPhone = phoneNumber.format("E.164");
    setIsPending(true);
    try {
      const result = await registerUser(
        data.name.toLowerCase(),
        formattedPhone,
        data.password
      );

      if (result?.error) {
        if (result.error.includes("телефон")) {
          setError("phone", { message: result.error });
        } else {
          alert(result.error);
        }
        setIsPending(false);
      } else {
        router.push(`/confirm?phone=${encodeURIComponent(formattedPhone)}`);
      }
    } catch (error) {
      setCaughtError(error as Error);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)}>
      <FormField
        id="name"
        label="Имя пользователя"
        name="name"
        type="text"
        placeholder="Имя пользователя"
        form={form}
        rules={{
          required: "Введите имя",
          minLength: { value: 4, message: "Минимум 4 символа" },
          maxLength: { value: 10, message: "Максимум 10 символов" },
          pattern: {
            value: /^[A-Za-z0-9_]+$/,
            message: "Только английские буквы, цифры или _",
          },
        }}
      />
      <FormField
        id="phone"
        label="Телефон"
        name="phone"
        type="tel"
        placeholder="+7XXXXXXXXXX"
        form={form}
        rules={{
          required: "Введите номер телефона",
          validate: (value) => {
            const phoneNumber = parsePhoneNumberFromString(value, "RU");
            return phoneNumber?.isValid() || "Неверный номер телефона";
          },
        }}
      />
      <div>Требуется Подтверждение через Telegram</div>
      <PasswordInput
        className={styles.input}
        placeholder="Пароль"
        autoComplete="new-password"
        {...form.register("password", {
          required: "Введите пароль",
          minLength: { value: 6, message: "Минимум 6 символов" },
          maxLength: { value: 12, message: "Максимум 12 символов" },
          pattern: {
            value: /^[A-Za-z0-9]+$/,
            message: "Только английские буквы или цифры",
          },
        })}
        error={errors.password?.message}
      />
      <PasswordInput
        className={styles.input}
        placeholder="Повторите пароль"
        {...form.register("confirmPassword", {
          required: "Повторите пароль",
          validate: (value) =>
            value === getValues("password") || "Пароли не совпадают",
        })}
        error={errors.confirmPassword?.message}
      />

      <button className={styles.button} type="submit" disabled={isPending}>
        {isPending ? "Создание..." : "Зарегистрироваться"}
      </button>
    </form>
  );
}
