export interface PresentationStats {
  overview: {
    totalViews: number;
    uniqueSessions: number;
    uniqueVisitors: number;
    avgTimeOnPage: number;
    avgScrollDepth: number;
    totalTimeSpent: number;
  };
  engagement: {
    deepEngagement: number;
    readToEnd: number;
    stayedLong: number;
    clickedCTA: number;
    avgClicksPerSession: number;
  };
  funnel: {
    hero: number;
    problem: number;
    solution: number;
    features: number;
    comparison: number;
    goals: number;
    contact: number;
  };
  byReferrer: {
    domain: string | null;
    views: number;
    uniqueSessions: number;
    avgTimeOnPage: number;
    deepEngagementRate: number;
  }[];
  byUTM: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    views: number;
  }[];
  byDevice: {
    deviceType: string | null;
    views: number;
    avgTimeOnPage: number;
  }[];
  scrollMilestones: {
    milestone: number;
    reached: number;
    percentage: number;
  }[];
  recentViews: {
    id: string;
    sessionId: string;
    referrer: string | null;
    referrerDomain: string | null;
    timeOnPage: number | null;
    scrollDepth: number | null;
    ctaClicks: number;
    deviceType: string | null;
    firstViewAt: Date;
    lastViewAt: Date;
  }[];
  timeDistribution: {
    hour: number;
    views: number;
  }[];
}
