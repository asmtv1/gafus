"use client";

import { Box, Button, Link, Paper, Slide, Typography } from "@mui/material";
import { useEffect, useId, useRef, useState } from "react";

import {
  COOKIE_CONSENT_STORAGE_KEY,
  getConsentValue,
  setConsentValue,
} from "./cookieConsentUtils";

interface CookieConsentBannerProps {
  cookiePolicyUrl?: string;
  storageKey?: string;
}

export function CookieConsentBanner({
  cookiePolicyUrl = "/cookies.html",
  storageKey = COOKIE_CONSENT_STORAGE_KEY,
}: CookieConsentBannerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const titleId = useId();
  const descId = useId();
  const acceptBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Читаем localStorage только после mount — hydration safety
    if (getConsentValue(storageKey) === null) {
      setIsVisible(true);
    }

    // Слушаем сброс согласия из профиля/панели
    const handleReset = () => setIsVisible(true);
    window.addEventListener("gafus:cookieConsentReset", handleReset);
    return () =>
      window.removeEventListener("gafus:cookieConsentReset", handleReset);
  }, [storageKey]);

  // Фокус на кнопку «Принять» при появлении
  useEffect(() => {
    if (isVisible) {
      acceptBtnRef.current?.focus();
    }
  }, [isVisible]);

  const handleAccept = () => {
    setConsentValue("accepted", storageKey);
    setIsVisible(false);
  };

  const handleDecline = () => {
    setConsentValue("declined", storageKey);
    setIsVisible(false);
  };

  // prefers-reduced-motion
  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  // Палитра GAFUS web: #dad3c1, #636128, #352e2e, #fff8e5, #4a4a1a
  const webPalette = {
    bg: "var(--bg-1, #dad3c1)",
    accent: "var(--bg-2, #636128)",
    accentDark: "#4a4a1a",
    dark: "#352e2e",
    cream: "#fff8e5",
    border: "var(--bg-2, #636128)",
  };

  return (
    <Slide
      direction="up"
      in={isVisible}
      timeout={prefersReducedMotion ? 0 : 300}
      mountOnEnter
      unmountOnExit
    >
      <Paper
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={descId}
        elevation={0}
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1500,
          p: { xs: 2, sm: 3 },
          borderRadius: 0,
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "flex-start", sm: "center" },
          gap: 2,
          backgroundColor: webPalette.cream,
          borderTop: `2px solid ${webPalette.border}`,
          boxShadow: "0 -4px 12px rgba(53, 46, 46, 0.08)",
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography
            id={titleId}
            variant="subtitle2"
            fontWeight="bold"
            gutterBottom
            sx={{ color: webPalette.dark }}
          >
            Использование cookies
          </Typography>
          <Typography id={descId} variant="body2" sx={{ color: webPalette.dark }}>
            Мы используем cookies для улучшения работы сайта и персонализации
            контента.{" "}
            <Link
              href={cookiePolicyUrl}
              target="_blank"
              rel="noopener noreferrer"
              underline="always"
              sx={{ color: webPalette.accent, fontWeight: 500 }}
            >
              Подробнее
            </Link>
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>
          <Button
            ref={acceptBtnRef}
            variant="contained"
            size="small"
            onClick={handleAccept}
            sx={{
              minHeight: 44,
              minWidth: 100,
              background: `linear-gradient(135deg, ${webPalette.accent} 0%, ${webPalette.accentDark} 100%)`,
              border: `1px solid ${webPalette.border}`,
              color: webPalette.cream,
              "&:hover": {
                background: `linear-gradient(135deg, ${webPalette.accentDark} 0%, ${webPalette.dark} 100%)`,
              },
            }}
          >
            Принять
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={handleDecline}
            sx={{
              minHeight: 44,
              minWidth: 100,
              border: `2px solid ${webPalette.border}`,
              color: webPalette.accent,
              "&:hover": {
                borderColor: webPalette.accentDark,
                backgroundColor: "rgba(99, 97, 40, 0.06)",
              },
            }}
          >
            Отклонить
          </Button>
        </Box>
      </Paper>
    </Slide>
  );
}
