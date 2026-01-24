import React from "react";

interface ValidationErrorProps {
  error?: string;
  className?: string;
}

export function ValidationError({ error, className = "" }: ValidationErrorProps) {
  if (!error) return null;

  return (
    <p className={`font-montserrat mt-1 text-[9px] leading-tight text-red-500 ${className}`}>
      {error}
    </p>
  );
}

// Компонент для отображения множественных ошибок
interface ValidationErrorsProps {
  errors: Record<string, string | undefined>;
  className?: string;
}

export function ValidationErrors({ errors, className = "" }: ValidationErrorsProps) {
  const errorMessages = Object.values(errors).filter(Boolean);

  if (errorMessages.length === 0) return null;

  return (
    <div className={`mt-2 text-sm text-red-500 ${className}`}>
      {errorMessages.map((error, index) => (
        <p key={index} className="mb-1">
          {error}
        </p>
      ))}
    </div>
  );
}
