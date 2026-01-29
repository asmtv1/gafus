"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  People,
  AdminPanelSettings,
  Notifications,
  TrendingUp,
  Assessment,
  ShoppingCart,
  Menu,
  Close,
} from "@mui/icons-material";
import { IconButton, Drawer, Box, Typography } from "@mui/material";

import styles from "../styles/MobileMenu.module.css";

interface MobileMenuProps {
  userName: string;
  avatarUrl: string;
  userRole: string;
}

export default function MobileMenu({ userName, avatarUrl, userRole }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const menuItems = [
    {
      href: "/main-panel/users",
      icon: People,
      label: "Пользователи платформы",
      show: true,
    },
    {
      href: "/main-panel/admin",
      icon: AdminPanelSettings,
      label: "Администрирование",
      show: true,
    },
    {
      href: "/main-panel/broadcasts",
      icon: Notifications,
      label: "Push-рассылка",
      show: userRole === "ADMIN",
    },
    {
      href: "/main-panel/reengagement",
      icon: TrendingUp,
      label: "Re-engagement",
      show: userRole === "ADMIN",
    },
    {
      href: "/main-panel/presentation-stats",
      icon: Assessment,
      label: "Стата по презентации",
      show: ["ADMIN", "MODERATOR"].includes(userRole),
    },
    {
      href: "/main-panel/purchases",
      icon: ShoppingCart,
      label: "Покупки курсов",
      show: ["ADMIN", "MODERATOR"].includes(userRole),
    },
  ].filter((item) => item.show);

  const handleClose = () => setOpen(false);

  return (
    <>
      <Box className={styles.mobileHeader}>
        <IconButton
          onClick={() => setOpen(true)}
          className={styles.menuButton}
          aria-label="Открыть меню"
        >
          <Menu />
        </IconButton>
      </Box>

      <Drawer
        anchor="left"
        open={open}
        onClose={handleClose}
        classes={{
          paper: styles.drawerPaper,
        }}
      >
        <Box className={styles.drawerHeader}>
          <Box className={styles.drawerUser}>
            <Image
              src={avatarUrl}
              alt="Avatar"
              width={48}
              height={48}
              className={styles.drawerAvatar}
            />
            <Typography variant="h6" className={styles.drawerUserName}>
              {userName}
            </Typography>
          </Box>
          <IconButton onClick={handleClose} className={styles.closeButton}>
            <Close />
          </IconButton>
        </Box>

        <Box className={styles.drawerMenu}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.drawerMenuItem} ${isActive ? styles.active : ""}`}
                onClick={handleClose}
              >
                <Icon sx={{ fontSize: 20, mr: 1.5 }} />
                {item.label}
              </Link>
            );
          })}
        </Box>
      </Drawer>
    </>
  );
}
