import { Alert, AlertTitle } from "@mui/material";
import React from "react";

interface ValidationErrorProps {
  error?: string;
  className?: string;
}

export function ValidationError({ error, className = "" }: ValidationErrorProps) {
  if (!error) return null;

  return (
    <Alert severity="error" sx={{ mt: 1, mb: 2 }} className={className}>
      {error}
    </Alert>
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
    <Alert severity="error" sx={{ mt: 2, mb: 2 }} className={className}>
      <AlertTitle>Ошибки в форме:</AlertTitle>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {errorMessages.map((error, index) => (
          <li key={index}>{error}</li>
        ))}
      </ul>
    </Alert>
  );
}

// Компонент для отображения ошибки под полем
interface FieldErrorProps {
  error?: string;
  className?: string;
}

export function FieldError({ error, className = "" }: FieldErrorProps) {
  if (!error) return null;

  return (
    <div
      style={{
        color: "#d32f2f",
        fontSize: "0.75rem",
        marginTop: "4px",
        marginBottom: "1rem",
      }}
      className={className}
    >
      {error}
    </div>
  );
}

