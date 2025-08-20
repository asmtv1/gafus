"use client";

import { Snackbar, Alert } from "@mui/material";
import { useCallback, useState } from "react";

export type ToastSeverity = "success" | "error" | "warning" | "info";

export function useToast() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<ToastSeverity>("info");

  const showToast = useCallback((msg: string, sev: ToastSeverity = "info") => {
    setMessage(msg);
    setSeverity(sev);
    setOpen(true);
  }, []);

  const closeToast = useCallback(() => setOpen(false), []);

  return { open, message, severity, showToast, closeToast, setOpen } as const;
}

export function Toast({
  open,
  message,
  severity,
  onClose,
}: {
  open: boolean;
  message: string;
  severity: ToastSeverity;
  onClose: () => void;
}) {
  return (
    <Snackbar
      open={open}
      autoHideDuration={3000}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert onClose={onClose} severity={severity} variant="filled" sx={{ width: "100%" }}>
        {message}
      </Alert>
    </Snackbar>
  );
}
