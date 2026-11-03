import { createElement, useState } from "react";
import { TrainerDailyBundlesOptInRoute } from "./TrainerDailyBundlesOptInRoute";
import { TrainerDailyBundleEditor } from "./TrainerDailyBundleEditor";
import type { DailyBundleTransport } from "./TrainerDailyBundlesOptInRoute";
import type { TrainerDailyManageTransport } from "./TrainerDailyBundleEditor";
import type { PanelActor } from "./consultationContract";

type Session = { actor: PanelActor; token: string | null; authEpoch?: string } | null;
export function TrainerDailyBundlesWorkspace(p: {
  pathname: string; actor: PanelActor; token: string | null; authEpoch?: string;
  enableDailyBundles?: boolean; enableDailyManage?: boolean;
  dailyBundleTransport?: DailyBundleTransport;
  dailyManageTransport?: TrainerDailyManageTransport;
  getCurrentSession?: () => Session;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const canEdit = p.enableDailyManage === true &&
    (p.actor.role === "TRAINER" || p.actor.role === "ADMIN");
  return createElement("div", { className: "trainer-workspace-route" },
    createElement(TrainerDailyBundlesOptInRoute, {
      ...p, key: `reader-${refresh}`,
      onEditBundle: canEdit ? (id: string) => setEditId(id) : undefined,
    }),
    canEdit ? createElement(TrainerDailyBundleEditor, {
      ...p, selectedBundleId: editId,
      onVerifiedChange: () => {
        setEditId(null);
        setRefresh(value => value + 1);
      },
    }) : null);
}
