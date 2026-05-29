import type { SurveyTemplate } from "@gafus/types";

const sections = [
  { id: "start", title: "Что происходит" },
  { id: "place", title: "Где собака остаётся" },
  { id: "departure", title: "Сборы и уход" },
  { id: "alone", title: "Поведение в одиночестве" },
  { id: "habits", title: "Еда, туалет и вещи" },
  { id: "limits", title: "Клетка и ограничения" },
  { id: "support", title: "Что уже пробовали" },
];

const commonQuestions = [
  {
    id: "concern",
    sectionId: "start",
    type: "textarea" as const,
    title: "Что вас насторожило?",
    description: "Опишите, что заставило подумать, что собаке страшно или тревожно оставаться одной.",
    required: true,
  },
  {
    id: "started_at_context",
    sectionId: "start",
    type: "textarea" as const,
    title: "Как давно это началось?",
    description: "Укажите, что происходило в жизни собаки или семьи в этот период.",
    required: true,
  },
  {
    id: "dog_location",
    sectionId: "place",
    type: "singleChoice" as const,
    title: "Где находится собака, когда никого нет дома?",
    required: true,
    options: [
      { value: "whole_home", label: "Свободно по всей квартире/дому" },
      { value: "one_room", label: "В одной комнате" },
      { value: "crate", label: "В клетке/вольере" },
      { value: "yard", label: "На улице во дворе" },
      { value: "tethered", label: "На привязи" },
      { value: "other", label: "Другое", allowsOther: true },
    ],
  },
  {
    id: "with_owner_behavior",
    sectionId: "departure",
    type: "multiChoice" as const,
    title: "Как собака ведёт себя, когда вы дома?",
    options: [
      { value: "follows", label: "Постоянно следует за мной" },
      { value: "contact", label: "Ищет тесный физический контакт" },
      { value: "independent", label: "Спит, играет и не следит за перемещениями" },
      { value: "other", label: "Другое", allowsOther: true },
    ],
  },
  {
    id: "departure_reaction",
    sectionId: "departure",
    type: "singleChoice" as const,
    title: "Как собака реагирует, когда видит, что вы собираетесь уходить?",
    options: [
      { value: "none", label: "Никак не реагирует" },
      { value: "anxious", label: "Начинает беспокоиться" },
      { value: "excited", label: "Сильно возбуждается" },
    ],
  },
  {
    id: "departure_signals",
    sectionId: "departure",
    type: "multiChoice" as const,
    title: "Какие действия служат сигналом ухода?",
    options: [
      { value: "keys_bag", label: "Беру ключи/сумку/рюкзак" },
      { value: "clothes_shoes", label: "Надеваю уличную одежду/обувь" },
      { value: "checks", label: "Проверяю краны/плиту/сигнализацию" },
      { value: "relocate", label: "Переселяю собаку в вольер/комнату" },
    ],
  },
  {
    id: "alone_behavior",
    sectionId: "alone",
    type: "multiChoice" as const,
    title: "Что происходит с собакой, пока вас нет?",
    required: true,
    options: [
      { value: "barks", label: "Лает, воет или скулит" },
      { value: "destroys", label: "Грызёт мебель, двери или вещи" },
      { value: "escapes", label: "Пытается выбраться" },
      { value: "panting_drooling", label: "Тяжело дышит, текут слюни" },
      { value: "paces", label: "Ходит по кругу или маршруту" },
      { value: "toilet", label: "Справляет нужду дома" },
      { value: "self_injury", label: "Наносит себе травмы" },
    ],
  },
  {
    id: "max_alone_time",
    sectionId: "alone",
    type: "text" as const,
    title: "Какое максимальное время собака может побыть одна без этих признаков?",
    placeholder: "Например: 5 минут, 30 минут, 2 часа",
  },
  {
    id: "destroyed_items",
    sectionId: "habits",
    type: "multiChoice" as const,
    title: "Что именно портит собака?",
    options: [
      { value: "doors", label: "Двери/ручки" },
      { value: "windows", label: "Оконные рамы" },
      { value: "furniture", label: "Мебель" },
      { value: "walls", label: "Стены/обои" },
      { value: "shoes", label: "Обувь и тапки" },
      { value: "toys", label: "Игрушки" },
      { value: "textile", label: "Текстиль" },
    ],
  },
  {
    id: "toilet_habits",
    sectionId: "habits",
    type: "singleChoice" as const,
    title: "Когда собака может сходить в туалет дома?",
    options: [
      { value: "never", label: "Никогда" },
      { value: "even_with_people", label: "Даже если кто-то дома" },
      { value: "alone_only", label: "Только когда никого нет дома" },
    ],
  },
  {
    id: "eats_when_alone",
    sectionId: "habits",
    type: "singleChoice" as const,
    title: "Ест ли собака корм или лакомства в ваше отсутствие?",
    options: [
      { value: "yes", label: "Да" },
      { value: "no", label: "Нет" },
      { value: "unknown", label: "Не знаю" },
    ],
  },
  {
    id: "crate_experience",
    sectionId: "limits",
    type: "textarea" as const,
    title: "Пробовали ли вы клетку/вольер? Как собака ведёт себя там одна?",
  },
  {
    id: "space_limits",
    sectionId: "limits",
    type: "textarea" as const,
    title: "Пробовали ли вы ограничивать пространство? Что сработало лучше всего?",
  },
  {
    id: "return_greeting",
    sectionId: "support",
    type: "singleChoice" as const,
    title: "Как собака встречает вас после возвращения?",
    options: [
      { value: "too_excited", label: "Слишком бурно и долго не успокаивается" },
      { value: "calms_fast", label: "Радуется, но быстро приходит в себя" },
    ],
  },
  {
    id: "specialists",
    sectionId: "support",
    type: "textarea" as const,
    title: "Консультировались ли вы с кинологом или ветеринаром? Что пробовали?",
  },
  {
    id: "medication",
    sectionId: "support",
    type: "textarea" as const,
    title: "Использовали ли успокоительные препараты или добавки? Какой был результат?",
  },
];

export const surveyTemplates: SurveyTemplate[] = [
  {
    slug: "dog-home-alone-initial",
    familySlug: "dog-home-alone",
    phase: "INITIAL",
    version: 1,
    title: "Собаке тяжело оставаться дома одной",
    description:
      "Этот опрос поможет понять поведение собаки и подобрать рекомендации для курса.",
    sections,
    questions: commonQuestions,
  },
  {
    slug: "dog-home-alone-final",
    familySlug: "dog-home-alone",
    phase: "FINAL",
    version: 1,
    title: "Повторная анкета после курса",
    description: "Ответьте на вопросы ещё раз, чтобы увидеть динамику после курса.",
    sections,
    questions: commonQuestions,
  },
];

export function findSurveyTemplate(slug: string): SurveyTemplate | null {
  return surveyTemplates.find((template) => template.slug === slug) ?? null;
}

export function isKnownSurveySlug(slug: string): boolean {
  return findSurveyTemplate(slug) !== null;
}
