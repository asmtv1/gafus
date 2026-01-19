// UI-специфичные типы для shared компонентов trainer-panel

export interface PasswordInputProps {
  error?: string;
  type?: string;
  placeholder?: string;
  value?: string;
  onChange?: (event: { target: { value: string } }) => void;
  onBlur?: (event: { target: { value: string } }) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  required?: boolean;
  autoComplete?: string;
  label?: string;
  visuallyHiddenLabel?: boolean;
  ariaLabel?: string;
  errorClassName?: string;
  [key: string]: unknown;
}
