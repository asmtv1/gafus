"use client";

import { Logout } from "@mui/icons-material";
import { Box, Button, Chip, Tab, Tabs, Typography } from "@mui/material";
import { signOut, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function UserInfo() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (pathname === "/") {
      setActiveTab(0);
    }
  }, [pathname]);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    if (newValue === 0) {
      router.push("/");
    }
  };

  if (!session?.user) {
    return null;
  }

  return (
    <Box sx={{ mb: 3 }}>
      {/* Навигация */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
        <Tabs value={activeTab} onChange={handleTabChange} aria-label="dashboard navigation">
          <Tab label="Основные ошибки" />
        </Tabs>
      </Box>

      {/* Информация о пользователе */}
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
    </Box>
  );
}
