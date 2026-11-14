import type { InactiveUser } from "./engine/reengagement-types";

type SchedulerDependencies = {
  findInactiveUsers(): Promise<InactiveUser[]>;
  checkAndCloseReturnedCampaigns(): Promise<number>;
  createCampaign(userId: string, lastActivityDate: Date): Promise<string>;
  isDue(userId: string): Promise<boolean>;
  activeCampaign(userId: string): Promise<{ id: string; currentLevel: number } | null>;
  dispatch(campaignId: string, userId: string, level: number): Promise<void>;
  onCampaignError(userId: string, error: unknown): void;
};

/**
 * Core business orchestration. No direct Redis/BullMQ dependency:
 * the worker only supplies queue transport and external failure logging.
 */
export async function scheduleReengagementInCore(deps: SchedulerDependencies) {
  const closedCampaigns = await deps.checkAndCloseReturnedCampaigns();
  const inactiveUsers = await deps.findInactiveUsers();
  let newCampaigns = 0;
  let scheduledNotifications = 0;

  for (const user of inactiveUsers) {
    if (!user.hasActiveCampaign) {
      try {
        const campaignId = await deps.createCampaign(user.userId, user.lastActivityDate);
        newCampaigns += 1;
        await deps.dispatch(campaignId, user.userId, 1);
        scheduledNotifications += 1;
      } catch (error) {
        deps.onCampaignError(user.userId, error);
      }
    } else {
      const isDue = await deps.isDue(user.userId);
      if (isDue) {
        const campaign = await deps.activeCampaign(user.userId);
        if (campaign) {
          await deps.dispatch(campaign.id, user.userId, campaign.currentLevel);
          scheduledNotifications += 1;
        }
      }
    }
  }
  return { newCampaigns, scheduledNotifications, closedCampaigns, inactiveUsersFound: inactiveUsers.length };
}
