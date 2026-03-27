"use client";

// components/ui/PasswordInput.tsx
import { useState } from "react";
import Image from "next/image";

import { ValidationError } from "./ValidationError";

import type { PasswordInputProps as Props } from "./types";
import type { FC } from "react";

export const PasswordInput: FC<Props> = ({
  error,
  className,
  label,
  visuallyHiddenLabel,
  ariaLabel,
  id,
  placeholder,
  errorClassName,
  // не пропускаем внешний type до инпута, чтобы управлять отображением пароля
  type: _typeIgnored,
  ...rest
}) => {
  const [show, setShow] = useState(false);
  const inputId = id ?? (rest.name as string | undefined);

  return (
    <div style={{ display: "block", width: "100%", boxSizing: "border-box" }}>
      {label && (
        // Этот стиль скрывает визуально сам лейбл, но оставляет его доступным для скринридеров (экранных читалок), чтобы обеспечить доступность для людей с нарушениями зрения.
        <label
          htmlFor={inputId}
          className={
            visuallyHiddenLabel
              ? "sr-only"
              : "mb-1 block text-sm font-medium text-gray-700"
          }
        >
          {label}
        </label>
      )}
      <div
        style={{
          position: "relative",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <input
          id={inputId}
          placeholder={placeholder}
          className={[className, "box-border"].filter(Boolean).join(" ")}
          type={show ? "text" : "password"}
          style={{
            paddingRight: 44,
            width: "100%",
            boxSizing: "border-box",
            minHeight: 44,
            ...(error ? { borderColor: "#c62828" } : {}),
          }}
          {...(!label ? { "aria-label": ariaLabel ?? placeholder ?? inputId } : {})}
          {...rest}
          aria-invalid={error ? true : undefined}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            height: 36,
            width: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label={show ? "Скрыть пароль" : "Показать пароль"}
          tabIndex={-1}
        >
          {show ? (
            <Image
              src="/uploads/hide.png"
              alt="Скрыть пароль"
              width={20}
              height={20}
              style={{ display: "block" }}
            />
          ) : (
            <Image
              src="/uploads/Show.png"
              alt="Показать пароль"
              width={20}
              height={20}
              style={{ display: "block" }}
            />
          )}
        </button>
      </div>
      <ValidationError error={error} className={errorClassName} />
    </div>
  );
};
