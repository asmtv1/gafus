import { createElement, useState } from "react";
import { TrainerDailyCalendarRead20261022 } from "./TrainerDailyCalendarRead20261022";
import { TrainerDailyScheduleEditor } from "./TrainerDailyScheduleEditor";
import type { ScheduleTransport } from "./tr014ScheduleRangeRead20261022";
import type { TrainerDailyManageTransport } from "./TrainerDailyBundleEditor";
import type { PanelActor } from "./consultationContract";

export function TrainerDailyCalendarWorkspace(p: {
  pathname: string; actor: PanelActor; token: string | null; authEpoch?: string;
  enableDailyCalendar?: boolean; enableDailyManage?: boolean;
  dailyCalendarTransport?: ScheduleTransport;
  dailyManageTransport?: TrainerDailyManageTransport;
  initialFrom: string;
  getCurrentSession?: () => {
    actor: PanelActor; token: string | null; authEpoch?: string;
  } | null;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const canEdit = p.enableDailyManage === true && p.actor.role === "ADMIN";
  return createElement("div", { className: "trainer-workspace-route" },
    createElement(TrainerDailyCalendarRead20261022, {
      ...p, enabled: p.enableDailyCalendar,
      transport: p.dailyCalendarTransport, refreshKey: refresh,
      onEditDate: canEdit ? (date: string) => setSelectedDate(date) : undefined,
    }),
    p.enableDailyManage ? createElement(TrainerDailyScheduleEditor, {
      ...p, key: selectedDate ?? "default",
      selectedDate,
      initialFrom: selectedDate ?? p.initialFrom,
      onVerifiedChange: () => setRefresh(value => value + 1),
    }) : null,
  );
}
