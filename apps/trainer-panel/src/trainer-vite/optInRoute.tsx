import { TrainerDailyImportRoute, type DailyImportTransport } from "./TrainerDailyImportRoute";
import {
  TrainerVideosMetadataRead20261022,
  type VideoMetadataTransport,
} from "./TrainerVideosMetadataRead20261022";
import {
  TrainerOwnArticlesRead20261022,
  type OwnArticlesTransport,
} from "./TrainerOwnArticlesRead20261022";
import { TrainerNotesRead20261022, type NotesReadTransport } from "./TrainerNotesRead20261022";
import { TrainerNotesManageRoute, type TrainerNotesManageTransport } from "./TrainerNotesManageRoute";
import { TrainerExamManageRoute, type TrainerExamManageTransport } from "./TrainerExamManageRoute";
import { TrainerArticleEditorRoute, type TrainerArticleWriteTransport } from "./TrainerArticleEditorRoute";
import { TrainerContentEditorRoute, type TrainerContentWriteTransport } from "./TrainerContentEditorRoute";
import { TrainerFullCourseEditorRoute, type TrainerFullCourseWriteTransport } from "./TrainerFullCourseEditorRoute";
import { TrainerVideosManageRoute, type TrainerVideoManageTransport } from "./TrainerVideosManageRoute";
import {
  TrainerExamSummaryRead20261022,
  type ExamSummaryTransport,
} from "./TrainerExamSummaryRead20261022";
import { TrainerDailyCalendarWorkspace } from "./TrainerDailyCalendarWorkspace";
import type { ScheduleTransport } from "./tr014ScheduleRangeRead20261022";
import type { VisibleDaysTransport } from "./trainerVisibleDaysRead20261022";
import { TrainerCourseVersionEditor20261022 } from "./TrainerCourseVersionEditor20261022";
import type { VersionedCourseOperations } from "./TrainerCourseVersionEditor20261022";
import { TrainerDailyBundlesWorkspace } from "./TrainerDailyBundlesWorkspace";
import type { DailyBundleTransport } from "./TrainerDailyBundlesOptInRoute";
import { createElement, type ReactElement } from "react";
import { ConsultationConsumerPreview } from "./ConsultationConsumerPreview";
import { TrainerConsultationCallRoute, trainerCallBookingId } from "./TrainerConsultationCallRoute";
import { TrainerVisibleDaysRoute } from "./TrainerVisibleDaysRoute";
import { TrainerCreateStepRoute } from "./TrainerCreateStepRoute";
import { TrainerCreateDayRoute } from "./TrainerCreateDayRoute";
import { TrainerCreateArticleRoute } from "./TrainerCreateArticleRoute";
import { TrainerCreateCourseRoute } from "./TrainerCreateCourseRoute";
import type { TrainerDailyManageTransport } from "./TrainerDailyBundleEditor";
import { TrainerDailyStatisticsRoute,
  type TrainerDailyStatisticsTransport } from "./TrainerDailyStatisticsRoute";
import type { TrainerAuthoringTransport } from "./trainerAuthoringClient";
import { initialDailyCalendarFrom } from "./trainerDailyDefaultRange";
import { TrainerStatisticsOptInRoute } from "./TrainerStatisticsOptInRoute";
import { TrainerPublicTemplatesOptInRoute } from "./TrainerPublicTemplatesOptInRoute";
import type { PublicTemplateTransport } from "./TrainerPublicTemplatesOptInRoute";
import { TrainerVisibleStepsOptInRoute } from "./TrainerVisibleStepsOptInRoute";
import type { VisibleStepTransport } from "./TrainerVisibleStepsOptInRoute";
import { TrainerCourseDraftReadOptInRoute } from "./TrainerCourseDraftReadOptInRoute";
import type { PanelActor } from "./consultationContract";
import { TrainerCourseFullFormSourceMock20261023 } from "./TrainerCourseFullFormSourceMock20261023";
import type { CourseFormSourceMockTransport } from "./trainerCourseFullFormSourceMockTransport20261023";
/** Test-injected identity: never read token from URL, localStorage or Next cookies. */
type TrainerOptInProps = {
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
  /** Default Vite entry never opts in; AG1 source-mounted routes are not enabled here. */
  enableVideoMetadataRead?: boolean;
  videoMetadataTransport?: VideoMetadataTransport;
  enableVideoManage?: boolean;
  videoManageTransport?: TrainerVideoManageTransport;
  enableOwnArticlesRead?: boolean;
  ownArticlesTransport?: OwnArticlesTransport;
  enableArticleManage?: boolean;
  enableContentManage?: boolean;
  enableFullCourseEdit?: boolean;
  fullCourseWriteTransport?: TrainerFullCourseWriteTransport;
  contentWriteTransport?: TrainerContentWriteTransport;
  articleWriteTransport?: TrainerArticleWriteTransport;
  enableNotesRead?: boolean;
  notesReadTransport?: NotesReadTransport;
  enableNotesManage?: boolean;
  notesManageTransport?: TrainerNotesManageTransport;
  enableExamSummary?: boolean;
  examSummaryTransport?: ExamSummaryTransport;
  enableExamManage?: boolean;
  examManageTransport?: TrainerExamManageTransport;
  enableProposedStatistics?: boolean;
  /** AG4 TR012 mocked read-only draft; not provided by default browser entry. */
  enableProposedCourseDraft?: boolean;
  enableCourseVersionEditor?: boolean;
  courseVersionOperations?: VersionedCourseOperations;
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
  dailyImportTransport?: DailyImportTransport;
  enableDailyBundles?: boolean;
  dailyBundleTransport?: DailyBundleTransport;
};
export function TrainerOptInRoute(p: TrainerOptInProps): ReactElement {
  if (p.pathname === "/main-panel/courses/new" && p.enableFullCourseEdit === true)
    return createElement(TrainerFullCourseEditorRoute, {
      ...p, enabled: true, courseReadTransport: p.notesReadTransport,
      courseWriteTransport: p.fullCourseWriteTransport,
      key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch, p.pathname]),
    });
  if (p.pathname === "/main-panel/courses/new" && p.enableAuthoring === true)
    return createElement(TrainerCreateCourseRoute, {
      ...p, key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]),
    });
  if (p.pathname === "/main-panel/daily-course/import")
    return createElement(TrainerDailyImportRoute, {
      ...p, enabled: p.enableDailyManage === true,
      key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]),
    });
  if (p.pathname === "/main-panel/daily-course/statistics")
    return createElement(TrainerDailyStatisticsRoute, {
      ...p, key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch, p.search]),
    });
  if (p.pathname === "/main-panel/steps/new")
    return createElement(TrainerCreateStepRoute, {
      ...p, key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]),
    });
  if (p.pathname === "/main-panel/days/new")
    return createElement(TrainerCreateDayRoute, {
      ...p, key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]),
    });
  if (p.pathname === "/main-panel/articles/new")
    return createElement(TrainerCreateArticleRoute, {
      ...p, key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]),
    });
  if (p.pathname === "/main-panel/days")
    return createElement(TrainerVisibleDaysRoute, {
      ...p, key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]),
    });
  if (p.pathname === "/main-panel/my-videos" && p.enableVideoManage === true)
    return createElement(TrainerVideosManageRoute, {
      ...p, enabled: true, videoReadTransport: p.videoMetadataTransport,
      videoWriteTransport: p.videoManageTransport,
      key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]),
    });
  if (p.pathname === "/main-panel/my-videos")
    return createElement(TrainerVideosMetadataRead20261022, {
      ...p,
      enabled: p.enableVideoMetadataRead === true,
      transport: p.videoMetadataTransport,
    });
  if (/^\/main-panel\/articles\/[a-zA-Z0-9_-]{1,128}\/edit\/?$/.test(p.pathname) &&
      p.enableArticleManage === true)
    return createElement(TrainerArticleEditorRoute, {
      ...p, enabled: true, articleReadTransport: p.ownArticlesTransport,
      key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch, p.pathname]),
    });
  if (p.pathname === "/main-panel/articles")
    return createElement(TrainerOwnArticlesRead20261022, {
      ...p,
      enabled: p.enableOwnArticlesRead === true,
      transport: p.ownArticlesTransport,
      writeTransport: p.articleWriteTransport,
      showEditorLinks: p.enableArticleManage === true,
    });
  if (/^\/main-panel\/(steps|days)\/[a-zA-Z0-9_-]{1,128}\/edit\/?$/.test(p.pathname) &&
      p.enableContentManage === true)
    return createElement(TrainerContentEditorRoute, {
      ...p, enabled: true, contentReadTransport: p.notesReadTransport,
      key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch, p.pathname]),
    });
  if (p.pathname === "/main-panel/notes" && p.enableNotesManage === true)
    return createElement(TrainerNotesManageRoute, {
      ...p, enabled: true,
      key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]),
    });
  if (p.pathname === "/main-panel/notes")
    return createElement(TrainerNotesRead20261022, {
      ...p,
      enabled: p.enableNotesRead === true,
      transport: p.notesReadTransport,
    });
  if (p.pathname === "/main-panel/exam-results" && p.enableExamManage === true)
    return createElement(TrainerExamManageRoute, {
      ...p, enabled: true,
      key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]),
    });
  if (p.pathname === "/main-panel/exam-results")
    return createElement(TrainerExamSummaryRead20261022, {
      ...p,
      enabled: p.enableExamSummary === true,
      transport: p.examSummaryTransport,
    });
  if (p.pathname === "/main-panel/daily-course")
    return createElement(TrainerDailyCalendarWorkspace, {
      ...p, initialFrom: initialDailyCalendarFrom(p.search, p.dailyCalendarInitialFrom),
      key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch, p.search]),
    });
  if (p.pathname === "/main-panel/daily-course/bundles")
    return createElement(TrainerDailyBundlesWorkspace, {
      ...p, key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]),
    });
  if (p.pathname === "/main-panel/templates")
    return createElement(TrainerPublicTemplatesOptInRoute, {
      ...p,
      key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]),
    });
  if (p.pathname === "/main-panel/steps" || p.pathname === "/main-panel/daily-course/steps")
    return createElement(TrainerVisibleStepsOptInRoute, {
      ...p, contentWriteTransport: p.contentWriteTransport,
      key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch, p.pathname, p.search]),
    });
  const fullFormPath =
    p.pathname === "/main-panel/courses/new" ||
    /^\/main-panel\/courses\/[^/]+\/edit\/?$/.test(p.pathname);
  const current = p.getCurrentSession
    ? p.getCurrentSession()
    : {
        actor: p.actor,
        token: p.token,
        authEpoch: p.authEpoch,
      };
  const mockAllowed =
    p.enableCourseFullFormSourceMock === true &&
    !!p.courseFullFormSourceMockTransport &&
    !!p.token &&
    !!p.authEpoch &&
    !!current &&
    current.actor.id === p.actor.id &&
    current.actor.role === p.actor.role &&
    current.token === p.token &&
    current.authEpoch === p.authEpoch &&
    (p.actor.role === "TRAINER" || p.actor.role === "ADMIN");
  if (fullFormPath && mockAllowed)
    return createElement(TrainerCourseFullFormSourceMock20261023, {
      ...p,
      enabled: true,
      transport: p.courseFullFormSourceMockTransport,
      key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch, p.pathname]),
    });
  if (/^\/main-panel\/courses\/[A-Za-z0-9_-]{1,128}\/edit\/?$/.test(p.pathname) &&
      p.enableFullCourseEdit === true)
    return createElement(TrainerFullCourseEditorRoute, {
      ...p, enabled: true, courseReadTransport: p.notesReadTransport,
      courseWriteTransport: p.fullCourseWriteTransport,
      key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch, p.pathname]),
    });
  if (/^\/main-panel\/courses\/[^/]+\/edit\/?$/.test(p.pathname)) {
    if (p.enableCourseVersionEditor === true)
      return createElement(TrainerCourseVersionEditor20261022, {
        ...p,
        enabled: true,
        ops: p.courseVersionOperations,
        key: JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]),
      });
    return createElement(TrainerCourseDraftReadOptInRoute, p);
  }
  if (trainerCallBookingId(p.pathname)) return createElement(
    TrainerConsultationCallRoute,
    { ...p, key: JSON.stringify([p.actor.id, p.actor.role, p.authEpoch, p.pathname]) },
  );
  if (p.pathname === "/main-panel/statistics") return createElement(TrainerStatisticsOptInRoute, p);
  if (
    p.pathname !== "/main-panel/consultations" &&
    p.pathname !== "/main-panel/consultations/availability"
  )
    return createElement(
      "main",
      null,
      createElement("p", { role: "alert" }, "Недоступный маршрут"),
    );

  const navAllowed =
    !!p.token &&
    p.actor.role === "TRAINER" &&
    !!current &&
    current.actor.role === p.actor.role &&
    current.actor.id === p.actor.id &&
    current.authEpoch === p.authEpoch &&
    current.token === p.token;
  return createElement(
    "main",
    { className:"trainer-workspace trainer-workspace-consultations-page" },
    createElement("h1", null,
      p.pathname === "/main-panel/consultations"
        ? "Консультации" : "Расписание консультаций"),
    navAllowed
      ? createElement(
          "nav",
          { "aria-label": "Консультации кинолога", className:"trainer-workspace-tabs" },
          createElement(
            "a",
            {
              href: "/main-panel/consultations",
              "aria-current": p.pathname === "/main-panel/consultations" ? "page" : undefined,
            },
            "Бронирования",
          ),
          createElement(
            "a",
            {
              href: "/main-panel/consultations/availability",
              "aria-current":
                p.pathname === "/main-panel/consultations/availability" ? "page" : undefined,
            },
            "Расписание",
          ),
        )
      : null,
    createElement(ConsultationConsumerPreview, p),
  );
}
