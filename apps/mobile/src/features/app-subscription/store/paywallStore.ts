import { create } from "zustand";

type PaywallReason = "required" | "onboarding";
export type PaywallContentMode = "subscription";

export type OpenPaywallParams = {
  reason?: PaywallReason;
  contentMode?: PaywallContentMode;
};

function normalizeParams(params?: PaywallReason | OpenPaywallParams): OpenPaywallParams {
  if (typeof params === "string") return { reason: params };
  return params ?? {};
}

function resolveContentMode(params: OpenPaywallParams): PaywallContentMode {
  return params.contentMode ?? "subscription";
}

type PaywallState = {
  isOpen: boolean;
  reason: PaywallReason | null;
  pendingReason: PaywallReason | null;
  contentMode: PaywallContentMode | null;
  pendingContentMode: PaywallContentMode | null;
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
  open: (params) => {
    const normalized = normalizeParams(params);
    set({
      isOpen: true,
      reason: normalized.reason ?? "required",
      pendingReason: null,
      contentMode: resolveContentMode(normalized),
      pendingContentMode: null,
    });
  },
  requestOpen: (params) => {
    const normalized = normalizeParams(params);
    set({
      pendingReason: normalized.reason ?? "required",
      pendingContentMode: resolveContentMode(normalized),
    });
  },
  close: () =>
    set({
      isOpen: false,
      reason: null,
      contentMode: null,
    }),
  clearPending: () =>
    set({
      pendingReason: null,
      pendingContentMode: null,
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
  });
}
