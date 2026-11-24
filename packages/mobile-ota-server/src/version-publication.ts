import { createHash } from "node:crypto";
import { mayPublishCheckoutToAll } from "./checkout-audience.js";
import {
  withVersionPublicationTransaction,
  versionPublicationReader,
} from "./version-publication-repository.js";
import type {
  VersionPublicationReader,
  Publication,
  BuildRow,
} from "./version-publication-repository.js";
export { versionOwnsScope } from "./version-publication-repository.js";

export type VersionScope = { platform: "ios" | "android"; runtimeVersion: string };
export class PublicationError extends Error {}

// Mandatory public YooKassa is permitted only for the already approved,
// verified App Store / RuStore delivery and when a fully signed checkout-free
// rollback exists for EVERY exact same native installation. No global
// runtime-only forcing or extrapolation to unverified/older native builds.
export type MandatoryPublicationChoice = {
  revision: number;
  checkout: boolean;
  complete: boolean;
  publicAppStoreReady: boolean;
  publicRustoreReady?: boolean;
  nativeIds: string[];
  recoveryFor: number | null;
  newer: boolean;
};
export function canRequirePublicCheckout(
  scope: VersionScope,
  selected: MandatoryPublicationChoice,
  choices: readonly MandatoryPublicationChoice[],
  approval: string | undefined,
): boolean {
  const storeReady = scope.platform === "ios" ? selected.publicAppStoreReady : selected.publicRustoreReady === true;
  if (!selected.checkout || !selected.complete || !storeReady ||
      !mayPublishCheckoutToAll(scope, approval) || selected.nativeIds.length===0) return false;
  const targets = new Set(selected.nativeIds);
  if (targets.size !== selected.nativeIds.length) return false;
  return choices.some((candidate) =>
    candidate.recoveryFor === selected.revision && !candidate.checkout &&
    candidate.complete && candidate.newer && candidate.nativeIds.length === targets.size &&
    candidate.nativeIds.every((id) => targets.has(id))
  );
}
const digest = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");

async function snapshot(db: VersionPublicationReader, scope: VersionScope) {
  const rows = await db.inventory(scope);
  const active = await db.latest(scope);
  const total = new Set(rows.map((r) => r.nativeId)).size;
  const verified = new Set(rows.filter((r) => r.verified).map((r) => r.nativeId)).size;
  const groups = new Map<string, BuildRow[]>();
  for (const row of rows) {
    if (!row.id) continue;
    // Android 1.7.5 RuStore checkout must never share a publication
    // selection group with internal QA or Google Play native releases.
    const key = digest([row.revision, row.title, row.recoveryFor, row.checkout,
      scope.platform === "android" && row.checkout && scope.runtimeVersion === "1.7.5"
        ? row.distribution : null]);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const activeRows = rows.filter((row) => row.id && active?.releaseIds.includes(row.id));
  const priorNatives = new Set(activeRows.map((row) => row.nativeId));
  const choices = [...groups]
    .map(([key, group]) => {
      const first = group[0]!;
      const recoveryPublished =
        active?.action === "RECOVER" &&
        active.revision === first.revision &&
        group.some((row) => active.releaseIds.includes(row.id!));
      const targets = new Set(
        rows
          .filter(
            (r) =>
              r.verified &&
              (scope.platform === "android" && first.checkout && first.distribution === "rustore"
                ? r.distribution === "rustore" :
                (!first.checkout || r.distribution === "internal" || (scope.platform === "ios" && scope.runtimeVersion === "1.7.5" && r.distribution === "app-store"))) &&
              (first.recoveryFor === null ||
                ((active?.revision === first.recoveryFor || recoveryPublished) &&
                  priorNatives.has(r.nativeId))),
          )
          .map((r) => r.nativeId),
      );
      const ready = group.filter((r) => r.ready && targets.has(r.nativeId));
      const publicAppStoreReady = ready.some((r) => r.distribution === "app-store");
      const publicRustoreReady = ready.some((r) => r.distribution === "rustore");
      const ids = ready.map((r) => r.id!);
      const expanded =
        active?.action === "TEST" &&
        active.revision === first.revision &&
        ids.length > active.releaseIds.length &&
        active.releaseIds.every((id) => ids.includes(id)) &&
        ready.every((r) => active.releaseIds.includes(r.id!) || r.newer);
      return {
        key,
        title: first.title,
        revision: first.revision,
        recoveryFor: first.recoveryFor,
        checkout: first.checkout,
        publicAppStoreReady,
        publicRustoreReady,
        ids,
        nativeIds: ready.map((r) => r.nativeId),
        compatible: ids.length,
        excluded: total - ids.length,
        complete: ids.length > 0 && ids.length === targets.size,
        expanded,
        newer:
          group.filter((r) => r.ready).every((r) => r.newer) &&
          first.revision > (active?.revision ?? 0),
        tested:
          active?.action === "TEST" &&
          ids.length === active.releaseIds.length &&
          ids.every((id) => active.releaseIds.includes(id)),
      };
    })
    .sort((a, b) => b.revision - a.revision);
  return {
    active: active ?? null,
    activeNativeIds: activeRows.map((row) => row.nativeId),
    total,
    verified,
    choices,
    activeChoice: choices.find(
      (choice) =>
        active?.releaseIds.length && active.releaseIds.every((id) => choice.ids.includes(id)),
    ),
    token: digest([scope.platform, scope.runtimeVersion, rows, active]),
  };
}

export type PublishInput = VersionScope & {
  action: "TEST" | "ALL" | "RECOVER" | "MANDATORY";
  token: string;
  key: string | null;
  required: boolean;
  operationId: string;
  actorId: string;
};
function stopId(id: string) {
  const h = digest(["stop", id]);
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "4" + h.slice(13, 16),
    "8" + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
}
async function transition(input: PublishInput, stop: boolean) {
  return withVersionPublicationTransaction(input, async (tx) => {
    const operationId = stop ? stopId(input.operationId) : input.operationId;
    const hash = digest([
      input.platform,
      input.runtimeVersion,
      input.action,
      input.key,
      input.token,
      input.required,
      input.actorId,
    ]);
    const replay = await tx.findOperation(operationId);
    if (replay) {
      if (replay.commandHash !== hash)
        throw new PublicationError("Идентификатор операции уже использован.");
      return replay.sequence;
    }
    const s = await snapshot(tx, input);
    const current = s.active;
    const ownStop = current?.operationId === stopId(input.operationId) && current.action === "STOP";
    if (s.token !== input.token && !(ownStop && !stop && input.action === "RECOVER"))
      throw new PublicationError("Реестр изменился. Обновите предварительную проверку.");
    let action: Publication["action"];
    let next: Pick<Publication, "public" | "required" | "revision" | "title" | "releaseIds">;
    if (stop) {
      action = "STOP";
      if (!current || current.action === "RECOVER")
        throw new PublicationError("Нет активного выпуска для отката.");
      if (current.action === "STOP") return current.sequence;
      next = current;
    } else if (input.action === "MANDATORY") {
      if (!current || current.action === "STOP")
        throw new PublicationError("Сначала опубликуйте совместимое подписанное обновление.");
      if (
        input.required &&
        (!s.activeChoice ||
          s.activeChoice.key !== input.key ||
          (s.activeChoice.checkout && current.public &&
            !canRequirePublicCheckout(input,s.activeChoice,s.choices,
              input.platform === "android"
                ? process.env.MOBILE_OTA_ANDROID_RUSTORE_YOOKASSA_PUBLIC_PUBLISH_APPROVED
                : process.env.MOBILE_OTA_IOS_YOOKASSA_PUBLIC_PUBLISH_APPROVED)))
      )
        throw new PublicationError(
          "Выберите опубликованную ревизию со всеми доступными подписанными пакетами.",
        );
      if (current.required === input.required)
        throw new PublicationError("У опубликованного обновления уже задана эта обязательность.");
      action = current.action;
      next = { ...current, required: input.required };
    } else {
      action = input.action;
      const c =
        input.action === "RECOVER"
          ? s.choices
              .filter((c) => c.recoveryFor === current?.revision && c.complete && c.newer)
              .at(-1)
          : s.choices.find((c) => c.key === input.key && c.recoveryFor === null);
      if (!c?.complete)
        throw new PublicationError(
          input.action === "RECOVER"
            ? "Новые платежи остановлены. Нужен подписанный пакет отката для всех подтверждённых сборок."
            : "Для каждой подтверждённой сборки нужен совместимый подписанный пакет.",
        );
      if (c.checkout && input.action === "ALL") {
        if (input.platform === "ios" && input.runtimeVersion === "1.7.5" && !c.publicAppStoreReady)
          throw new PublicationError("Для публичной оплаты нужна подписанная и подтверждённая App Store-сборка.");
        if (input.platform === "android" && input.runtimeVersion === "1.7.5" && !c.publicRustoreReady)
          throw new PublicationError("Для публичной оплаты нужна подписанная и подтверждённая RuStore-сборка.");
        if (input.runtimeVersion !== "1.7.5" || !["ios", "android"].includes(input.platform))
          throw new PublicationError("Пакет с внутренней оплатой доступен только тестерам.");
        if (!mayPublishCheckoutToAll(input, input.platform === "android"
          ? process.env.MOBILE_OTA_ANDROID_RUSTORE_YOOKASSA_PUBLIC_PUBLISH_APPROVED
          : process.env.MOBILE_OTA_IOS_YOOKASSA_PUBLIC_PUBLISH_APPROVED))
          throw new PublicationError("Массовая оплата через ЮKassa запрещена без явного разрешения на выпуск.");
      }
      if (input.action === "ALL" && !c.tested)
        throw new PublicationError("Сначала выпустите этот набор тестерам.");
      if (input.action !== "ALL" && !c.newer && !(input.action === "TEST" && c.expanded))
        throw new PublicationError("Нужна следующая ревизия с более поздней датой.");
      if (
        input.action === "TEST" &&
        (current?.action === "STOP" || (current?.action === "TEST" && !c.expanded))
      )
        throw new PublicationError("Завершите текущий тестовый выпуск или откат.");
      if (input.action === "RECOVER" && current?.action !== "STOP")
        throw new PublicationError("Текущий выпуск изменился.");
      next = {
        revision: c.revision,
        title: c.title,
        releaseIds: c.ids,
        public: input.action === "ALL" || (input.action === "RECOVER" && !!current?.public),
        required: false,
      };
    }
    const sequence = (current?.sequence ?? 0) + 1;
    await tx.append({
      ...next,
      platform: input.platform,
      runtimeVersion: input.runtimeVersion,
      sequence,
      operationId,
      commandHash: hash,
      actorId: input.actorId,
      action,
    });
    return sequence;
  });
}
export async function publishVersionUpdate(input: PublishInput) {
  if (input.action !== "MANDATORY" && input.required)
    throw new PublicationError("Обязательность назначается отдельным действием после публикации.");
  if (input.action === "RECOVER") await transition(input, true);
  return { sequence: await transition(input, false) };
}

export async function previewVersionPublication(scope: VersionScope) {
  const s = await snapshot(versionPublicationReader, scope);
  return {
    total: s.total,
    verified: s.verified,
    token: s.token,
    active: s.active && {
      title: s.active.title,
      revision: s.active.revision,
      action: s.active.action,
      public: s.active.public,
      required: s.active.required,
      key: s.activeChoice?.key ?? null,
      nativeIds: s.activeNativeIds,
    },
    choices: s.choices.map(({ ids, ...choice }) => choice),
  };
}
