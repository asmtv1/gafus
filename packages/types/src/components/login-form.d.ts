import type { ReactNode } from "react";
export interface LoginFormProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  allowedRoles?: string[];
  redirectPath?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}
//# sourceMappingURL=login-form.d.ts.map
