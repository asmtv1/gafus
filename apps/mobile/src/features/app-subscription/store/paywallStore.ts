import { create } from "zustand";

type PaywallReason = "required" | "onboarding";
export type PaywallContentMode = "subscription" | "rewarded" | "combined";
type RewardedTargetType = "ARTICLE" | "COURSE_STEP" | "DAILY_COURSE_STEP" | "CONSULTATION_BOOKING";

export type PaywallRewardedTarget = {
  targetType: RewardedTargetType;
  targetId: string;
};

export type PaywallAccessSummary = {
  title: string;
  subtitle: string;
};

export type OpenPaywallParams = {
  reason?: PaywallReason;
  contentMode?: PaywallContentMode;
  rewardedTarget?: PaywallRewardedTarget | null;
  accessSummary?: PaywallAccessSummary | null;
  onRewardedGrant?: (() => Promise<void> | void) | null;
};

function normalizeParams(params?: PaywallReason | OpenPaywallParams): OpenPaywallParams {
  if (typeof params === "string") return { reason: params };
  return params ?? {};
}

function resolveContentMode(params: OpenPaywallParams): PaywallContentMode {
  return params.contentMode ?? (params.rewardedTarget ? "combined" : "subscription");
}

type PaywallState = {
  isOpen: boolean;
  reason: PaywallReason | null;
  pendingReason: PaywallReason | null;
  contentMode: PaywallContentMode | null;
  pendingContentMode: PaywallContentMode | null;
  rewardedTarget: PaywallRewardedTarget | null;
  pendingRewardedTarget: PaywallRewardedTarget | null;
  accessSummary: PaywallAccessSummary | null;
  pendingAccessSummary: PaywallAccessSummary | null;
  onRewardedGrant: (() => Promise<void> | void) | null;
  pendingOnRewardedGrant: (() => Promise<void> | void) | null;
  open: (params?: PaywallReason | OpenPaywallParams) => void;
  requestOpen: (params?: PaywallReason | OpenPaywallParams) => void;
  close: () => void;
  clearPending: () => void;
};

export const usePaywallStore = create<PaywallState>((set) => ({
  isOpen: false,
  reason: null,
  pendingReason: null,
  contentMode: null,
  pendingContentMode: null,
  rewardedTarget: null,
  pendingRewardedTarget: null,
  accessSummary: null,
  pendingAccessSummary: null,
  onRewardedGrant: null,
  pendingOnRewardedGrant: null,
  open: (params) => {
    const normalized = normalizeParams(params);
    set({
      isOpen: true,
      reason: normalized.reason ?? "required",
      pendingReason: null,
      contentMode: resolveContentMode(normalized),
      pendingContentMode: null,
      rewardedTarget: normalized.rewardedTarget ?? null,
      pendingRewardedTarget: null,
      accessSummary: normalized.accessSummary ?? null,
      pendingAccessSummary: null,
      onRewardedGrant: normalized.onRewardedGrant ?? null,
      pendingOnRewardedGrant: null,
    });
  },
  requestOpen: (params) => {
    const normalized = normalizeParams(params);
    set({
      pendingReason: normalized.reason ?? "required",
      pendingContentMode: resolveContentMode(normalized),
      pendingRewardedTarget: normalized.rewardedTarget ?? null,
      pendingAccessSummary: normalized.accessSummary ?? null,
      pendingOnRewardedGrant: normalized.onRewardedGrant ?? null,
    });
  },
  close: () =>
    set({
      isOpen: false,
      reason: null,
      contentMode: null,
      rewardedTarget: null,
      accessSummary: null,
      onRewardedGrant: null,
    }),
  clearPending: () =>
    set({
      pendingReason: null,
      pendingContentMode: null,
      pendingRewardedTarget: null,
      pendingAccessSummary: null,
      pendingOnRewardedGrant: null,
    }),
}));

export function openAppSubscriptionPaywall(params: PaywallReason | OpenPaywallParams = "required") {
  usePaywallStore.getState().open(params);
}

export function requestAppSubscriptionPaywall(
  params: PaywallReason | OpenPaywallParams = "required",
) {
  usePaywallStore.getState().requestOpen(params);
}

export function flushDeferredAppSubscriptionPaywall() {
  const state = usePaywallStore.getState();
  if (!state.pendingReason) return;
  state.open({
    reason: state.pendingReason,
    contentMode: state.pendingContentMode ?? undefined,
    rewardedTarget: state.pendingRewardedTarget,
    accessSummary: state.pendingAccessSummary,
    onRewardedGrant: state.pendingOnRewardedGrant,
  });
}
