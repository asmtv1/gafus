"use client";

import { Box, Container, Paper, TextField, Button, Typography, Alert } from "@mui/material";
import { useRouter } from "next/navigation";
import { signIn, getSession } from "next-auth/react";
import { useState } from "react";

export default function LoginForm() {
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
        setError(result.error);
      } else {
        // Проверяем роль пользователя после входа
        const session = await getSession();
        if (session?.user?.role && ["ADMIN", "MODERATOR"].includes(session.user.role)) {
          router.push("/");
          router.refresh();
        } else {
          setError("У вас нет доступа к этой странице");
          // Выход из системы
          await fetch("/api/auth/signout", { method: "POST" });
        }
      }
    } catch {
      setError("Произошла ошибка при входе");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Вход в Error Dashboard
        </Typography>
        <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 3 }}>
          Только для администраторов и модераторов
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
