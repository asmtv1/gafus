export interface ReengagementMetrics {
  overview: {
    totalCampaigns: number;
    activeCampaigns: number;
    totalNotificationsSent: number;
    clickedNotifications: number;
    returnedUsers: number;
    unsubscribedUsers: number;
    clickRate: number;
    returnRate: number;
  };
  byLevel: {
    level1: MetricsByLevel;
    level2: MetricsByLevel;
    level3: MetricsByLevel;
  };
  byType: {
    skillMaintenance: MetricsByType;
    weMissYou: MetricsByType;
    dogDevelopment: MetricsByType;
  };
  recentCampaigns: RecentCampaign[];
}

export interface MetricsByLevel {
  sent: number;
  clicked: number;
  clickRate: number;
}

export interface MetricsByType {
  sent: number;
  clicked: number;
  clickRate: number;
}

export interface RecentCampaign {
  id: string;
  userId: string;
  userName: string | null;
  campaignStartDate: Date;
  level: number;
  notificationsSent: number;
  clicked: number;
  returned: boolean;
  unsubscribed: boolean;
  isActive: boolean;
}
