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
        elevation={6}
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
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography
            id={titleId}
            variant="subtitle2"
            fontWeight="bold"
            gutterBottom
          >
            Использование cookies
          </Typography>
          <Typography id={descId} variant="body2" color="text.secondary">
            Мы используем cookies для улучшения работы сайта и персонализации
            контента.{" "}
            <Link
              href={cookiePolicyUrl}
              target="_blank"
              rel="noopener noreferrer"
              underline="always"
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
            sx={{ minHeight: 44, minWidth: 100 }}
          >
            Принять
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={handleDecline}
            sx={{ minHeight: 44, minWidth: 100 }}
          >
            Отклонить
          </Button>
        </Box>
      </Paper>
    </Slide>
  );
}
