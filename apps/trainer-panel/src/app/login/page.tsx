import { LoginForm } from "@gafus/ui-components";
import { School } from "@mui/icons-material";

export default function LoginPage() {
  return (
    <LoginForm
      title="Панель тренера"
      subtitle="Вход для администраторов, модераторов и тренеров"
      icon={<School sx={{ fontSize: 40, color: "primary.main" }} />}
      allowedRoles={["ADMIN", "MODERATOR", "TRAINER"]}
      redirectPath="/main-panel"
    />
  );
}
