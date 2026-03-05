// Данные для LoginForm компонента

export interface LoginFormProps {
  title?: string;
  subtitle?: string;
  icon?: unknown; // React.ReactNode
  allowedRoles?: string[];
  redirectPath?: string;
  showVkLogin?: boolean;
  onSuccess?: (session?: unknown) => void;
  onError?: (error: string) => void;
  onVkLogin?: () => void | Promise<void>;
}
