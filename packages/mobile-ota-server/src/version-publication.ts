import { createHash } from "node:crypto";
import { withVersionPublicationTransaction, versionPublicationReader } from "./version-publication-repository.js";
import type { VersionPublicationReader, Publication, BuildRow } from "./version-publication-repository.js";
export { versionOwnsScope } from "./version-publication-repository.js";

export type VersionScope = { platform: "ios" | "android"; runtimeVersion: string };
export class PublicationError extends Error {}
const digest = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");

async function snapshot(db: VersionPublicationReader, scope: VersionScope) {
  const rows = await db.inventory(scope);
  const active = await db.latest(scope);
  const total = new Set(rows.map((r) => r.nativeId)).size;
  const verified = new Set(rows.filter((r) => r.verified).map((r) => r.nativeId)).size;
  const groups = new Map<string, BuildRow[]>();
  for (const row of rows) {
    if (!row.id) continue;
    const key = digest([row.revision, row.title, row.recoveryFor, row.checkout]);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const choices = [...groups]
    .map(([key, group]) => {
      const first = group[0]!;
      const priorNatives = new Set(
        rows.filter((r) => r.id && active?.releaseIds.includes(r.id)).map((r) => r.nativeId),
      );
      const targets = new Set(
        rows
          .filter(
            (r) =>
              r.verified &&
              (!first.checkout || r.distribution === "internal") &&
              (first.recoveryFor === null ||
                (active?.revision === first.recoveryFor && priorNatives.has(r.nativeId))),
          )
          .map((r) => r.nativeId),
      );
      const ready = group.filter((r) => r.ready && targets.has(r.nativeId));
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
        ids,
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
    total,
    verified,
    choices,
    token: digest([scope.platform, scope.runtimeVersion, rows, active]),
  };
}

export type PublishInput = VersionScope & {
  action: "TEST" | "ALL" | "RECOVER";
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
      const ownStop =
        current?.operationId === stopId(input.operationId) && current.action === "STOP";
      if (s.token !== input.token && !(ownStop && !stop && input.action === "RECOVER"))
        throw new PublicationError("Реестр изменился. Обновите предварительную проверку.");
      const action = stop ? "STOP" : input.action;
      let next: Pick<Publication, "public" | "required" | "revision" | "title" | "releaseIds">;
      if (stop) {
        if (!current || current.action === "RECOVER")
          throw new PublicationError("Нет активного выпуска для отката.");
        if (current.action === "STOP") return current.sequence;
        next = current;
      } else {
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
        if (input.platform === "android" && c.checkout && input.action === "ALL")
          throw new PublicationError("Android-пакет с тестовой оплатой доступен только тестерам.");
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
          required: input.action === "RECOVER" || input.required,
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
  if (input.action === "RECOVER") await transition(input, true);
  return { sequence: await transition(input, false) };
}

export async function previewVersionPublication(scope: VersionScope) {
  const s = await snapshot(versionPublicationReader, scope);
  return {
    ...s,
    active: s.active && {
      title: s.active.title,
      revision: s.active.revision,
      action: s.active.action,
      public: s.active.public,
      required: s.active.required,
    },
    choices: s.choices.map(({ ids, ...choice }) => choice),
  };
}
