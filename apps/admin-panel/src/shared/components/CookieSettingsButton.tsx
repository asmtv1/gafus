"use client";

import { Cookie } from "@mui/icons-material";
import { resetCookieConsent } from "@gafus/ui-components";

/**
 * Кнопка «Управление cookies» для сайдбара и мобильного меню.
 * Вызывает resetCookieConsent() — баннер появляется без перезагрузки.
 */
export default function CookieSettingsButton({
  className,
}: {
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => resetCookieConsent()}
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        font: "inherit",
        color: "inherit",
      }}
    >
      <Cookie sx={{ fontSize: 20, mr: 1.5 }} />
      Управление cookies
    </button>
  );
}
