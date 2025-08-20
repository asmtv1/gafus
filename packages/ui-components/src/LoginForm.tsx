"use client";

import { School } from "@mui/icons-material";
import { Box, Container, Paper, TextField, Button, Typography, Alert } from "@mui/material";
import { useRouter } from "next/navigation";
import { signIn, getSession } from "next-auth/react";
import { useState } from "react";

import type { LoginFormProps, UserSession } from "@gafus/types";

export default function LoginForm({
  title = "Вход в систему",
  subtitle = "Введите ваши учетные данные",
  icon = <School sx={{ fontSize: 40, color: "primary.main" }} />,
  allowedRoles = [],
  redirectPath = "/",
  onSuccess,
  onError,
}: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (result?.error) {
        const errorMessage = result.error;
        setError(errorMessage);
        onError?.(errorMessage);
      } else {
        // Проверяем роль пользователя после входа
        const session = (await getSession()) as UserSession;
        if (session?.user?.role) {
          if (allowedRoles.length === 0 || allowedRoles.includes(session.user.role)) {
            router.push(redirectPath);
            router.refresh();
            onSuccess?.();
          } else {
            const errorMessage = `У вас нет доступа к этой странице. Требуемые роли: ${allowedRoles.join(", ")}`;
            setError(errorMessage);
            onError?.(errorMessage);
            // Выход из системы
            await fetch("/api/auth/signout", { method: "POST" });
          }
        } else {
          const errorMessage = "Не удалось получить информацию о пользователе";
          setError(errorMessage);
          onError?.(errorMessage);
        }
      }
          } catch (err) {
      const errorMessage = "Произошла ошибка при входе";
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 3 }}>
          <>{icon}</>
          <Typography variant="h4" component="h1" sx={{ ml: 2 }}>
            {title}
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 3 }}>
          {subtitle}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Имя пользователя"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            margin="normal"
            required
            disabled={loading}
          />
          <TextField
            fullWidth
            label="Пароль"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            margin="normal"
            required
            disabled={loading}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={loading}
          >
            {loading ? "Вход..." : "Войти"}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}
