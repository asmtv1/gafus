// Общие типы для компонентов

// Общий тип для пользователя с базовыми полями
export interface BaseUser {
  id: string;
  username: string;
}

// Общий тип для дня с базовыми полями
export interface BaseDay {
  id: string;
  title: string;
}

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

export interface FormFieldProps<T> {
  control: {
    register: (name: keyof T) => {
      onChange: (event: { target: { value: string } }) => void;
      onBlur: () => void;
      name: keyof T;
    };
  };
  name: keyof T;
  label: string;
  type?: string;
  placeholder?: string;
  rules?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    validate?: (value: unknown) => boolean | string;
  };
  className?: string;
}

export interface BurgerIconProps {
  onClick?: () => void;
}

export interface DualListSelectorProps<T> {
  availableItems: T[];
  selectedItems: T[];
  onItemsChange: (selectedItems: T[]) => void;
  getItemKey: (item: T) => string;
  getItemLabel: (item: T) => string;
  availableTitle?: string;
  selectedTitle?: string;
  placeholder?: string;
  className?: string;
}
