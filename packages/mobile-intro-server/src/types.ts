export type MobileIntroPlatform = "IOS" | "ANDROID";
export type MobileIntroCompletion = "COMPLETED" | "SKIPPED";
export type MobileIntroAuthOutcome = "REGISTERED" | "LOGGED_IN";

export type MobileIntroEventInput = {
  installationId: string;
  introVersion: string;
  platform: MobileIntroPlatform;
  openedAt: Date;
  event: "OPENED" | MobileIntroCompletion;
  occurredAt: Date;
};

export type MobileIntroReport = {
  timeZone: "Europe/Samara";
  range: { start: string; end: string };
  generatedAt: string;
  openings: number;
  completed: number;
  skipped: number;
  registered: number;
  loggedIn: number;
  pendingAuth: number;
};
