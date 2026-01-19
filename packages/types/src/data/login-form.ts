// Данные для LoginForm компонента

export interface LoginFormProps {
  title?: string;
  subtitle?: string;
  icon?: unknown; // React.ReactNode
  allowedRoles?: string[];
  redirectPath?: string;
  onSuccess?: (session?: unknown) => void;
  onError?: (error: string) => void;
}
