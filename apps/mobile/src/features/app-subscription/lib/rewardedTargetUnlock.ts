type RewardedTargetUnlockStatus = {
  target?: {
    unlocked: boolean;
    canUnlockWithCurrentBalance: boolean;
  };
};

export function shouldTriggerRewardedTargetUnlock(input: {
  hasUnlockCallback: boolean;
  status: RewardedTargetUnlockStatus | null;
}): boolean {
  if (!input.hasUnlockCallback) return false;
  const target = input.status?.target;
  if (!target) return false;
  return target.unlocked || target.canUnlockWithCurrentBalance;
}
