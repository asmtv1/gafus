export const EXCUSE_SITUATIONS = [
  {
    id: "late-work",
    label: "Опоздал на работу",
    promptLabel: "опоздал на работу",
    description:
      "Нужна взрослая, уважительная причина задержки без чрезмерной драмы и без очевидной лжи.",
  },
  {
    id: "homework",
    label: "Не сделал домашку",
    promptLabel: "не сделал домашку",
    description:
      "Нужна аккуратная причина для преподавателя: признать ответственность, но звучать убедительно.",
  },
  {
    id: "birthday",
    label: "Забыл про день рождения",
    promptLabel: "забыл про день рождения",
    description:
      "Нужно извиниться тепло и креативно, чтобы человек почувствовал внимание, а не формальность.",
  },
  {
    id: "missed-meeting",
    label: "Пропустил встречу",
    promptLabel: "пропустил встречу",
    description:
      "Нужна деловая отмазка с предложением быстро исправить ситуацию и назначить новое время.",
  },
  {
    id: "ignored-message",
    label: "Не ответил на сообщение",
    promptLabel: "не ответил на сообщение",
    description:
      "Нужно объяснить молчание тактично, без обесценивания собеседника и без лишнего пафоса.",
  },
] as const;

export type ExcuseSituation = (typeof EXCUSE_SITUATIONS)[number];
export type ExcuseSituationId = ExcuseSituation["id"];

export function findExcuseSituation(id: unknown): ExcuseSituation | null {
  if (typeof id !== "string") return null;
  return EXCUSE_SITUATIONS.find((situation) => situation.id === id) ?? null;
}
