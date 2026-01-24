"use client";

import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

import styles from "../styles/PageLayout.module.css";

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export default function PageLayout({ title, subtitle, children }: PageLayoutProps) {
  return (
    <Box className={styles.pageContainer}>
      <Box className={styles.pageHeader}>
        <Typography variant="h3" className={styles.pageTitle}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="h6" className={styles.pageSubtitle}>
            {subtitle}
          </Typography>
        )}
      </Box>
      <Box className={styles.contentCard}>{children}</Box>
    </Box>
  );
}
