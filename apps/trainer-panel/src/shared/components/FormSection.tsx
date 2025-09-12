"use client";

import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

import styles from "../styles/FormLayout.module.css";

interface FormSectionProps {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}

export default function FormSection({ title, children, icon }: FormSectionProps) {
  return (
    <Box className={styles.formSection}>
      <Typography variant="h6" className={styles.formSectionTitle}>
        {icon}
        {title}
      </Typography>
      {children}
    </Box>
  );
}
