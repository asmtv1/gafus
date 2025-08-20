"use client";

import { Logout } from "@mui/icons-material";
import { Box, Typography, Button, Chip } from "@mui/material";
import { useSession, signOut } from "next-auth/react";

export default function UserInfo() {
  const { data: session } = useSession();

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  if (!session?.user) {
    return null;
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
      <Typography variant="body2" color="text.secondary">
        Пользователь: {session.user.username}
      </Typography>
      <Chip
        label={session.user.role}
        color={session.user.role === "ADMIN" ? "error" : "warning"}
        size="small"
      />
      <Button variant="outlined" size="small" startIcon={<Logout />} onClick={handleSignOut}>
        Выйти
      </Button>
    </Box>
  );
}
