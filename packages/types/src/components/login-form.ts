import type { ReactNode } from "../types";

export interface LoginFormProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  allowedRoles?: string[];
  redirectPath?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}
