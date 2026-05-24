import { create } from "zustand";

type PaywallReason = "required" | "onboarding";

type PaywallState = {
  isOpen: boolean;
  reason: PaywallReason | null;
  pendingReason: PaywallReason | null;
  open: (params?: { reason?: PaywallReason }) => void;
  requestOpen: (params?: { reason?: PaywallReason }) => void;
  close: () => void;
  clearPending: () => void;
};

export const usePaywallStore = create<PaywallState>((set) => ({
  isOpen: false,
  reason: null,
  pendingReason: null,
  open: (params) => set({ isOpen: true, reason: params?.reason ?? "required", pendingReason: null }),
  requestOpen: (params) => {
    const reason = params?.reason ?? "required";
    set({ pendingReason: reason });
  },
  close: () => set({ isOpen: false, reason: null }),
  clearPending: () => set({ pendingReason: null }),
}));

export function openAppSubscriptionPaywall(reason: PaywallReason = "required") {
  usePaywallStore.getState().open({ reason });
}

export function requestAppSubscriptionPaywall(reason: PaywallReason = "required") {
  usePaywallStore.getState().requestOpen({ reason });
}

export function flushDeferredAppSubscriptionPaywall() {
  const state = usePaywallStore.getState();
  if (!state.pendingReason) return;
  state.open({ reason: state.pendingReason });
}
