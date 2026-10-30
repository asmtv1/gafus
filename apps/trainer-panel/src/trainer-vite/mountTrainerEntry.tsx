import type { ScheduleTransport } from "./tr014ScheduleRangeRead20261022";
import type { VisibleDaysTransport } from "./trainerVisibleDaysRead20261022";
import type { VersionedCourseOperations } from "./TrainerCourseVersionEditor20261022";
import type { DailyBundleTransport } from "./TrainerDailyBundlesOptInRoute";
import type { TrainerAuthoringTransport } from "./trainerAuthoringClient";
import type { TrainerDailyStatisticsTransport } from "./TrainerDailyStatisticsRoute";
import type { TrainerDailyManageTransport } from "./TrainerDailyBundleEditor";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TrainerOptInRoute } from "./optInRoute";
import type { PublicTemplateTransport } from "./TrainerPublicTemplatesOptInRoute";
import type { VisibleStepTransport } from "./TrainerVisibleStepsOptInRoute";
import type { PanelActor } from "./consultationContract";
import type { CourseFormSourceMockTransport } from "./trainerCourseFullFormSourceMockTransport20261023";
/** Actual opt-in Vite entry -> existing route -> Hono consumer -> booking UI. */
export function mountTrainerEntry(
  mount: Element,
  session: {
    pathname: string;
    search?: string;
    actor: PanelActor;
    token: string | null;
    fetchImpl: typeof fetch;
    authEpoch?: string;
    getCurrentSession?: () => {
      actor: PanelActor;
      token: string | null;
      authEpoch?: string;
    } | null;
    /** TEST-INJECTED only; default browser entry cannot enable source-mounted GETs. */
    enableProposedStatistics?: boolean;
    /** Scoped fixture-only; no browser enablement for unmounted trainer CRUD. */
    enableProposedCourseDraft?: boolean;
    enableCourseVersionEditor?: boolean;
    courseVersionOperations?: VersionedCourseOperations;
    /** Dormant test-injected full form ONLY; absent from main.tsx. */
    enableCourseFullFormSourceMock?: boolean;
    courseFullFormSourceMockTransport?: CourseFormSourceMockTransport;
    enableVisibleSteps?: boolean;
    visibleStepsTransport?: VisibleStepTransport;
    enablePublicTemplates?: boolean;
    publicTemplateTransport?: PublicTemplateTransport;
    enableVisibleDays?: boolean;
    visibleDaysTransport?: VisibleDaysTransport;
    enableDailyCalendar?: boolean;
    dailyCalendarTransport?: ScheduleTransport;
    dailyCalendarInitialFrom?: string;
    enableDailyStatistics?: boolean;
    dailyStatisticsTransport?: TrainerDailyStatisticsTransport;
    enableAuthoring?: boolean;
    authoringTransport?: TrainerAuthoringTransport;
    enableDailyManage?: boolean;
    dailyManageTransport?: TrainerDailyManageTransport;
    enableDailyBundles?: boolean;
    dailyBundleTransport?: DailyBundleTransport;
  },
): Root {
  const root = createRoot(mount);
  root.render(createElement(TrainerOptInRoute, session));
  return root;
}
