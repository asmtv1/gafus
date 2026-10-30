import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  StyleSheet: { create: <T>(styles: T) => styles },
}));
vi.mock("@/shared/config", () => ({
  COLORS: {
    cardBackground: "#FFFFFF", text: "#222", textSecondary: "#666",
    success: "#4E611F", surface: "#FEFEFE",
  },
  FONTS: { montserratMedium: "Montserrat" },
  SPACING: { xs: 4, sm: 8, md: 16, lg: 24 },
}));

import { STEP_STATUS_CONFIG, WEB, styles } from "./AccordionStep.presentation";

describe("AccordionStep extracted presentation contract", () => {
  it("retains exact progress/owner-visible status icons and palette", () => {
    expect(STEP_STATUS_CONFIG.NOT_STARTED.icon).toBe("clock-outline");
    expect(STEP_STATUS_CONFIG.IN_PROGRESS.icon).toBe("progress-clock");
    expect(STEP_STATUS_CONFIG.COMPLETED.icon).toBe("check-circle-outline");
    expect(STEP_STATUS_CONFIG.COMPLETED.foregroundColor).toBe("#4E611F");
    expect(STEP_STATUS_CONFIG.PAUSED.icon).toBe("pause-circle-outline");
    expect(STEP_STATUS_CONFIG.RESET.icon).toBe("restart");
  });
  it("retains layout tokens for accordion and timer controls", () => {
    expect(styles.container).toMatchObject({ borderRadius: 20, paddingHorizontal: 18 });
    expect(styles.timerDisplay).toMatchObject({ fontSize: 48, fontVariant: ["tabular-nums"] });
    expect(WEB.stepBorder).toBe("#636128");
  });
});
