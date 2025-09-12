"use client";

import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

import styles from "../styles/FormLayout.module.css";

interface FormPageLayoutProps {
  title: string;
  children: ReactNode;
  subtitle?: string;
}

export default function FormPageLayout({ title, children, subtitle }: FormPageLayoutProps) {
  return (
    <Box className={styles.formPageContainer}>
      <Typography variant="h4" className={styles.formPageTitle}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body1" color="text.secondary" sx={{ textAlign: "center", mb: 3 }}>
          {subtitle}
        </Typography>
      )}
      {children}
    </Box>
  );
}
