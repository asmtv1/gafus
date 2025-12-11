"use client";

import { usePathname, useRouter } from "next/navigation";
import { Tabs, Tab, Paper } from "@mui/material";
import {
  Dashboard as DashboardIcon,
  Queue as QueueIcon,
} from "@mui/icons-material";

export function NavigationTabs() {
  const pathname = usePathname();
  const router = useRouter();

  const getCurrentTab = () => {
    if (pathname === "/") return "/";
    if (pathname.startsWith("/queues")) return "/queues";
    return "/";
  };

  const handleChange = (_event: React.SyntheticEvent, newValue: string) => {
    router.push(newValue);
  };

  return (
    <Paper 
      elevation={1} 
      sx={{ 
        mb: 4,
        borderRadius: 2,
        overflow: "hidden"
      }}
    >
      <Tabs
        value={getCurrentTab()}
        onChange={handleChange}
        variant="fullWidth"
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          "& .MuiTab-root": {
            minHeight: 64,
            fontSize: "1rem",
            fontWeight: 500,
            textTransform: "none",
          },
        }}
      >
        <Tab
          icon={<DashboardIcon />}
          iconPosition="start"
          label="Дашборд ошибок"
          value="/"
          sx={{
            color: getCurrentTab() === "/" ? "#7b1fa2" : undefined,
          }}
        />
        <Tab
          icon={<QueueIcon />}
          iconPosition="start"
          label="Очереди"
          value="/queues"
          sx={{
            color: getCurrentTab() === "/queues" ? "#9c27b0" : undefined,
          }}
        />
      </Tabs>
    </Paper>
  );
}

