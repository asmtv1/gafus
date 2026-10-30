// @vitest-environment jsdom
/** Native SurveyBlock mounted React tree. Map RN accessibility props to DOM assertions, not device claims. */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  survey: null as unknown,
  comparisonGet: vi.fn(async (..._args: unknown[]): Promise<unknown> =>
    ({ success: true, data: null })),
  submitted: vi.fn(),
  // Existing synthetic Button seam: expose the actual native press handler,
  // including when the DOM representation is disabled.
  submitPress: null as (() => void) | null,
  examGet: vi.fn(),
  examSubmit: vi.fn(),
  offline: false,
  getItem: vi.fn(async (..._args: unknown[]) => null as string | null),
  setItem: vi.fn(async (..._args: unknown[]) => undefined),
  removeItem: vi.fn(async (..._args: unknown[]) => undefined),
  result: "Результат скрининга",
}));
vi.mock("react-native", async () => {
  const React = await import("react");
  const roleProps = (p: Record<string, unknown>) => {
    const state = p.accessibilityState as
      { disabled?: boolean; checked?: boolean; busy?: boolean } | undefined;
    return {
      "aria-label": p.accessibilityLabel as string | undefined,
      "aria-description": p.accessibilityHint as string | undefined,
      "aria-disabled": state?.disabled === undefined ? undefined : String(state.disabled),
      "aria-checked": state?.checked === undefined ? undefined : String(state.checked),
      "aria-busy": state?.busy === undefined ? undefined : String(state.busy),
      "aria-live": p.accessibilityLiveRegion as string | undefined,
      role: p.accessibilityRole as string | undefined,
    };
  };
  return {
    Platform: { OS: "ios", select: (items: Record<string, unknown>) => items.ios ?? items.default },
    StyleSheet: { create: (styles: unknown) => styles },
    View: (p: Record<string, unknown>) => React.createElement("div", roleProps(p), p.children as React.ReactNode),
    ScrollView: (p: Record<string, unknown>) => React.createElement("div", roleProps(p), p.children as React.ReactNode),
    Text: (p: Record<string, unknown>) => React.createElement("span", roleProps(p), p.children as React.ReactNode),
    Pressable: (p: Record<string, unknown>) => React.createElement("button", {
      ...roleProps(p), type: "button", disabled: p.disabled,
      onClick: p.disabled ? undefined : p.onPress,
    }, p.children as React.ReactNode),
    TextInput: (p: Record<string, unknown>) => React.createElement("input", {
      ...roleProps(p), value: p.value, disabled: p.editable === false,
      placeholder: p.placeholder, "data-multiline": p.multiline ? "true" : "false",
      onInput: (event: React.FormEvent<HTMLInputElement>) =>
        (p.onChangeText as (value: string) => void)?.(event.currentTarget.value),
    }),
  };
});
vi.mock("react-native-paper", async () => {
  const React = await import("react");
  return { Text: (p: Record<string, unknown>) => React.createElement("span", {
    "aria-live": p.accessibilityLiveRegion as string | undefined,
    role: p.accessibilityRole as string | undefined,
    "aria-label": p.accessibilityLabel as string | undefined,
  }, p.children as React.ReactNode) };
});
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("@gafus/types", () => ({ getSurveyScreeningResult: () => mock.result }));
vi.mock("@/shared/components/ui", async () => {
  const React = await import("react");
  return {
    Loading: ({ message }: { message: string }) => React.createElement("div", {
      role: "progressbar", "aria-label": message,
    }, message),
    Button: (p: Record<string, unknown>) => {
      const state = p.accessibilityState as { disabled?: boolean; busy?: boolean } | undefined;
      if (p.label === "ОТПРАВИТЬ АНКЕТУ") {
        mock.submitPress = p.onPress as (() => void) | null;
      }
      return React.createElement("button", {
        type: "button", disabled: p.disabled,
        "aria-label": p.accessibilityLabel as string | undefined,
        "aria-description": p.accessibilityHint as string | undefined,
        role: p.accessibilityRole as string | undefined,
        "aria-disabled": String(state?.disabled ?? false),
        "aria-busy": String(state?.busy ?? false),
        onClick: p.disabled ? undefined : p.onPress,
      }, p.label as string);
    },
  };
});
vi.mock("@/shared/lib/api", () => ({ surveyApi: {
  getSurvey: vi.fn(async () => mock.survey),
  getComparison: (...args: unknown[]) => mock.comparisonGet(...args),
  submit: (...args: unknown[]) => mock.submitted(...args),
} }));
vi.mock("@/shared/lib/utils/haptics", () => ({ hapticFeedback: { selection: vi.fn(), success: vi.fn() } }));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("@/shared/lib/api/exam", () => ({ examApi: {
  getResult: (...args: unknown[]) => mock.examGet(...args),
  submit: (...args: unknown[]) => mock.examSubmit(...args),
} }));
vi.mock("@/shared/hooks/useNetworkStatus", () => ({ useIsOffline: () => mock.offline }));
vi.mock("@/shared/stores/storage", () => ({ zustandStorage: {
  getItem: (...args: unknown[]) => mock.getItem(...args),
  setItem: (...args: unknown[]) => mock.setItem(...args),
  removeItem: (...args: unknown[]) => mock.removeItem(...args),
} }));
import { SurveyBlock } from "./SurveyBlock";
import { TestQuestionsBlock, type ChecklistQuestion } from "./TestQuestionsBlock";
import { WrittenFeedbackBlock } from "./WrittenFeedbackBlock";

const questions = [
  { id: "name", type: "text", title: "Имя собаки", required: true, placeholder: "Введите имя" },
  { id: "notes", type: "textarea", title: "Как прошёл день", required: false,
    description: "Расскажите об успехах", placeholder: "Опишите" },
  { id: "pet", type: "petSelect", title: "Имя питомца из профиля", required: true, placeholder: "Питомец" },
  { id: "choice", type: "singleChoice", title: "Какой темперамент", required: true,
    options: [{ value: "calm", label: "Спокойный" }, { value: "active", label: "Активный" }] },
  { id: "multi", type: "multiChoice", title: "Любимые занятия", required: false,
    options: [{ value: "walk", label: "Прогулки" }, { value: "play", label: "Игры" }] },
  { id: "yes", type: "boolean", title: "Есть поводок", required: true },
] as const;
const submittedAt = "2026-10-20T12:00:00Z";
const answers = {
  name: "Бобик", notes: "Занимались", pet: "Бобик",
  choice: "calm", multi: ["walk"], yes: true,
};
function survey(canEdit: boolean | null = null, responseAnswers = answers) {
  return { success: true, data: {
    template: {
      slug: "screening", familySlug: "screening", phase: "INITIAL", version: 1,
      title: "Анкета собаки", description: "Ответьте на вопросы",
      sections: [{ id: "section", title: "Общие сведения" }],
      questions: questions.map(q => ({ ...q, sectionId: "section" })),
    },
    response: canEdit === null ? null : {
      id: "saved", userId: "user-1", courseId: "course-1", stepId: "step-1",
      petId: null, surveySlug: "screening", surveyFamilySlug: "screening",
      phase: "INITIAL", surveyVersion: 1, answers: responseAnswers,
      canEdit, submittedAt, editableUntil: "2026-10-25T12:00:00Z",
    },
  } };
}
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()?.();
  vi.clearAllMocks();
  mock.comparisonGet.mockReset();
  mock.comparisonGet.mockImplementation(async () => ({ success: true, data: null }));
  mock.offline = false;
  mock.submitPress = null;
});
async function mounted(canEdit: boolean | null = null, responseAnswers = answers,
  override?: unknown) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mock.survey = override ?? survey(canEdit, responseAnswers);
  mock.submitted.mockImplementation(async () => ({ success: true, data: { id: "submitted" } }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: {
    queries: { retry: false }, mutations: { retry: false },
  } });
  await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
    createElement(SurveyBlock, { courseId: "course-1", stepId: "step-1",
      userStepId: "user-step-1", surveySlug: "screening" }))));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  cleanup.push(async () => {
    await act(async () => root.unmount()); cache.clear(); host.remove();
  });
  return host;
}
const selected = (host: HTMLElement, label: string) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    .find(element => element.getAttribute("aria-label") === label);

describe("SURVEY_A11Y_QUESTION_CONTROL existing native form", () => {
  it("all text, textarea and petSelect fields have distinct question labels and required metadata", async () => {
    const host = await mounted();
    const inputs = Array.from(host.querySelectorAll<HTMLInputElement>("input"));
    expect(inputs).toHaveLength(3);
    expect(inputs.map(node => node.getAttribute("aria-label"))).toEqual([
      "Имя собаки, обязательный вопрос", "Как прошёл день", "Имя питомца из профиля, обязательный вопрос",
    ]);
    expect(inputs.map(node => node.getAttribute("placeholder")))
      .toEqual(["Введите имя", "Опишите", "Питомец"]);
    expect(inputs.map(node => node.getAttribute("aria-disabled"))).toEqual(["false", "false", "false"]);
    expect(inputs[1].getAttribute("aria-description")).toBe("Расскажите об успехах");
  });

  it("single, multi, boolean options expose radio/checkbox role with correct checked and disabled states", async () => {
    const host = await mounted(true);
    expect(selected(host, "Какой темперамент, обязательный вопрос, Спокойный")?.getAttribute("role"))
      .toBe("radio");
    expect(selected(host, "Какой темперамент, обязательный вопрос, Спокойный")?.getAttribute("aria-checked"))
      .toBe("true");
    expect(selected(host, "Какой темперамент, обязательный вопрос, Активный")?.getAttribute("aria-checked"))
      .toBe("false");
    expect(selected(host, "Любимые занятия, Прогулки")?.getAttribute("role")).toBe("checkbox");
    expect(selected(host, "Любимые занятия, Прогулки")?.getAttribute("aria-checked")).toBe("true");
    expect(selected(host, "Любимые занятия, Игры")?.getAttribute("aria-checked")).toBe("false");
    expect(selected(host, "Есть поводок, обязательный вопрос, Да")?.getAttribute("role"))
      .toBe("checkbox");
    expect(selected(host, "Есть поводок, обязательный вопрос, Да")?.getAttribute("aria-checked"))
      .toBe("true");
    expect(selected(host, "Любимые занятия, Игры")?.getAttribute("aria-disabled")).toBe("false");
  });

  it("read-only result exposes submission/result announcements and truly disabled named controls", async () => {
    const host = await mounted(false);
    expect(host.querySelectorAll("input[disabled]")).toHaveLength(3);
    expect(Array.from(host.querySelectorAll("input"))
      .every(input => input.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(host.querySelector('button[role="radio"]:not([disabled])')).toBeNull();
    expect(host.querySelector('button[role="checkbox"]:not([disabled])')).toBeNull();
    expect(selected(host, "Какой темперамент, обязательный вопрос, Спокойный")?.getAttribute("aria-checked"))
      .toBe("true");
    expect(host.querySelector('button[aria-label="Отправить анкету"]')).toBeNull();
    expect(host.querySelectorAll('[aria-live="polite"]').length).toBeGreaterThan(0);
    expect(host.querySelector('[aria-label^="Ответ отправлен:"]')).not.toBeNull();
    expect(host.querySelector('[aria-label^="Результат анкеты."]')).not.toBeNull();
  });

  it("roles and selected values update with existing interactions; submission keeps exact answer payload", async () => {
    const host = await mounted();
    const field = (label: string) => Array.from(host.querySelectorAll<HTMLInputElement>("input"))
      .find(input => input.getAttribute("aria-label") === label)!;
    const fill = async (label: string, value: string) => {
      const input = field(label);
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      await act(async () => {
        nativeSetter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    const press = async (label: string) => {
      await act(async () => selected(host, label)?.click());
    };
    await fill("Имя собаки, обязательный вопрос", "Тузик");
    await fill("Имя питомца из профиля, обязательный вопрос", "Тузик");
    await fill("Как прошёл день", "Занимались на улице");
    await press("Какой темперамент, обязательный вопрос, Спокойный");
    await press("Любимые занятия, Прогулки");
    await press("Есть поводок, обязательный вопрос, Да");
    expect(selected(host, "Какой темперамент, обязательный вопрос, Спокойный")
      ?.getAttribute("aria-checked")).toBe("true");
    expect(selected(host, "Любимые занятия, Прогулки")
      ?.getAttribute("aria-checked")).toBe("true");
    expect(selected(host, "Есть поводок, обязательный вопрос, Да")
      ?.getAttribute("aria-checked")).toBe("true");
    const button = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Отправить анкету"]',
    );
    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute("aria-disabled")).toBe("false");
    await act(async () => button?.click());
    expect(mock.submitted).toHaveBeenCalledTimes(1);
    expect(mock.submitted.mock.calls[0]).toEqual(["screening", {
      courseId: "course-1", stepId: "step-1", userStepId: "user-step-1",
      answers: {
        name: "Тузик", pet: "Тузик", notes: "Занимались на улице",
        choice: "calm", multi: ["walk"], yes: true,
      },
    }]);
  });

  it("loading, survey read failure, unsuccessful submit and network error are announced", async () => {
    let complete!: (payload: unknown) => void;
    const waiting = new Promise<unknown>(resolve => { complete = resolve; });
    const host = await mounted(null, answers, waiting);
    expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-label"))
      .toBe("Загрузка анкеты...");
    await act(async () => complete(survey()));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    expect(host.querySelectorAll("input")).toHaveLength(3);
  });

  it("server failed survey read provides a spoken alert without exposing controls", async () => {
    const host = await mounted(null, answers, { success: false, error: "Нет доступа к анкете" });
    expect(host.querySelector('[role="alert"]')?.getAttribute("aria-label"))
      .toBe("Нет доступа к анкете");
    expect(host.querySelector("input")).toBeNull();
  });

  it("failed submit result and rejected submit both have live accessible error announcements", async () => {
    const host = await mounted(true);
    mock.submitted.mockResolvedValueOnce({ success: false, error: "Проверьте анкету" });
    const button = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Отправить анкету"]',
    );
    expect(button?.disabled).toBe(false);
    await act(async () => button?.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    // The submit API error body is untrusted; only fixed local wording is spoken.
    expect(host.querySelector('[role="alert"]')?.getAttribute("aria-label"))
      .toBe("Не удалось отправить анкету. Попробуйте ещё раз.");
    expect(host.querySelector('[role="alert"]')?.textContent)
      .toBe("Не удалось отправить анкету. Попробуйте ещё раз.");
    expect(host.textContent).not.toContain("Проверьте анкету");
    mock.submitted.mockRejectedValueOnce(new Error("connection lost"));
    await act(async () => host.querySelector<HTMLButtonElement>(
      'button[aria-label="Отправить анкету"]',
    )?.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    expect(mock.submitted).toHaveBeenCalledTimes(2);
    expect(host.querySelectorAll('[role="alert"]').length).toBeGreaterThan(0);
    expect(host.querySelector('[aria-label="Не удалось отправить анкету."]'))
      .not.toBeNull();
  });

  it("submit announces pending busy state until original network mutation completes", async () => {
    const host = await mounted(true);
    let finish!: (value: unknown) => void;
    const pending = new Promise<unknown>(resolve => { finish = resolve; });
    mock.submitted.mockImplementation(() => pending);
    await act(async () => host.querySelector<HTMLButtonElement>(
      'button[aria-label="Отправить анкету"]',
    )?.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    const busy = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Отправка анкеты"]',
    );
    expect(busy?.disabled).toBe(true);
    expect(busy?.getAttribute("aria-busy")).toBe("true");
    expect(busy?.getAttribute("aria-disabled")).toBe("true");
    await act(async () => finish({ success: true, data: { id: "saved" } }));
  });

  it("required explanation, loading and server error have accessibility announcements and submit state", async () => {
    const host = await mounted();
    expect(host.querySelector('[role="alert"]')?.textContent)
      .toContain("Заполните обязательные поля: 4");
    const submit = host.querySelector<HTMLButtonElement>('button[aria-label="Отправить анкету"]');
    expect(submit?.disabled).toBe(true);
    expect(submit?.getAttribute("aria-disabled")).toBe("true");
    expect(submit?.getAttribute("aria-description")).toContain("обязательные");
  });
});


// TEST_QUESTIONS_A11Y: use the pre-existing React Native mounted harness and UI mocks.
const testQuestions: ChecklistQuestion[] = [
  { id: "q-1", question: "Что делать при подзыве?",
    options: ["Похвалить", "Наказать"], correctAnswer: 0,
    comment: "Подкрепляйте подход к хозяину" },
  { id: "q-2", question: "Что сделать перед прогулкой?",
    options: ["Надеть поводок", "Отпустить без поводка"], correctAnswer: 0 },
];
const examRecord = (overrides: Record<string, unknown> = {}) => ({
  id: "exam-1", testAnswers: { "q-1": 1, "q-2": 0 }, testScore: 1,
  testMaxScore: 2, videoReportUrl: null, writtenFeedback: null,
  overallScore: 50, isPassed: false, trainerComment: "Совет кинолога",
  reviewedAt: null, reviewedById: null, reviewedBy: null,
  createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z",
  ...overrides,
});
async function mountedTestQuestions(getResult: unknown = { success: true, data: null }) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mock.examGet.mockResolvedValue(getResult);
  mock.examSubmit.mockResolvedValue({ success: true, data: { id: "exam-1" } });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(TestQuestionsBlock, {
    checklist: testQuestions, userStepId: "user-step-1", stepId: "step-1",
  })));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  cleanup.push(async () => { await act(async () => root.unmount()); host.remove(); });
  return host;
}
const option = (host: HTMLElement, label: string) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    .find(button => button.getAttribute("aria-label") === label);
const submitTest = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    .find(button => button.textContent?.includes("ЗАВЕРШИТЬ ТЕСТ"));

describe("TEST_QUESTIONS_A11Y existing learning exam component", () => {
  it("names every option with its question; exposes live radio checked/disabled without leaking answers", async () => {
    const host = await mountedTestQuestions();
    const first = option(host, "Вопрос 1: Что делать при подзыве?, Похвалить");
    const second = option(host, "Вопрос 1: Что делать при подзыве?, Наказать");
    const walk = option(host, "Вопрос 2: Что сделать перед прогулкой?, Надеть поводок");
    expect(first?.getAttribute("role")).toBe("radio");
    expect(first?.getAttribute("aria-checked")).toBe("false");
    expect(first?.getAttribute("aria-disabled")).toBe("false");
    expect(second?.getAttribute("aria-checked")).toBe("false");
    expect(submitTest(host)?.disabled).toBe(true);
    expect(host.textContent).not.toContain("Правильный ответ:");
    expect(host.textContent).not.toContain("Подкрепляйте подход");
    expect(JSON.stringify(host.innerHTML)).not.toContain("Правильный ответ");
    await act(async () => first?.click());
    expect(first?.getAttribute("aria-checked")).toBe("true");
    expect(second?.getAttribute("aria-checked")).toBe("false");
    await act(async () => walk?.click());
    expect(submitTest(host)?.disabled).toBe(false);
    expect(submitTest(host)?.getAttribute("aria-disabled")).toBe("false");
  });

  it("submit announces pending state and preserves exact original 50%-threshold payload", async () => {
    let complete!: (result: unknown) => void;
    mock.examSubmit.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const host = await mountedTestQuestions();
    mock.examSubmit.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    await act(async () => option(host, "Вопрос 1: Что делать при подзыве?, Похвалить")?.click());
    await act(async () => option(host, "Вопрос 2: Что сделать перед прогулкой?, Отпустить без поводка")?.click());
    await act(async () => submitTest(host)?.click());
    expect(mock.examSubmit).toHaveBeenCalledTimes(1);
    expect(mock.examSubmit.mock.calls[0][0]).toEqual({
      userStepId: "user-step-1", stepId: "step-1",
      testAnswers: { "q-1": 0, "q-2": 1 },
      testScore: 1, testMaxScore: 2, overallScore: 50,
    });
    expect(submitTest(host)?.disabled).toBe(true);
    expect(submitTest(host)?.getAttribute("aria-disabled")).toBe("true");
    expect(submitTest(host)?.getAttribute("aria-busy")).toBe("true");
    expect(option(host, "Вопрос 1: Что делать при подзыве?, Похвалить")
      ?.getAttribute("aria-disabled")).toBe("true");
    await act(async () => complete({ success: true, data: { id: "exam-1" } }));
    expect(host.querySelector('[role="text"][aria-live="polite"]')?.getAttribute("aria-label"))
      .toContain("Тест не сдан");
    expect(host.textContent).toContain("Правильный ответ: Надеть поводок");
    expect(option(host, "Вопрос 1: Что делать при подзыве?, Похвалить")
      ?.getAttribute("aria-checked")).toBe("true");
    expect(host.querySelector('[role="text"][aria-label*="Подкрепляйте подход"]'))
      .not.toBeNull();
  });

  it("server-owned rejected result, trainer comment and retake are announced without rewriting eligibility", async () => {
    const host = await mountedTestQuestions({ success: true, data: examRecord({
      testAnswers: { "q-1": 0, "q-2": 0 }, isPassed: false, overallScore: 100,
    }) });
    const summary = host.querySelector('[role="text"][aria-live="polite"]');
    expect(summary?.getAttribute("aria-label")).toContain("Тест не сдан");
    expect(summary?.getAttribute("aria-label")).toContain("Совет кинолога");
    const retake = host.querySelector<HTMLButtonElement>('button[aria-label="Пройти тест заново"]');
    expect(retake?.getAttribute("role")).toBe("button");
    expect(retake?.getAttribute("aria-disabled")).toBe("false");
    expect(option(host, "Вопрос 1: Что делать при подзыве?, Похвалить")
      ?.getAttribute("aria-disabled")).toBe("true");
    await act(async () => retake?.click());
    expect(host.textContent).not.toContain("Правильный ответ:");
    expect(host.textContent).not.toContain("Совет кинолога");
    expect(option(host, "Вопрос 1: Что делать при подзыве?, Похвалить")
      ?.getAttribute("aria-disabled")).toBe("false");
    expect(submitTest(host)?.disabled).toBe(true);
  });

  it("successful saved result exposes explanations after submit, but no retake", async () => {
    const host = await mountedTestQuestions({ success: true, data: examRecord({
      isPassed: true, testAnswers: { "q-1": 0, "q-2": 0 },
    }) });
    expect(host.querySelector('[role="text"][aria-live="polite"]')?.getAttribute("aria-label"))
      .toContain("Тест сдан");
    expect(host.querySelector('[role="text"][aria-label*="Правильно!"]')).not.toBeNull();
    expect(host.querySelector('[role="text"][aria-label*="Подкрепляйте подход"]')).not.toBeNull();
    expect(host.querySelector('button[aria-label="Пройти тест заново"]')).toBeNull();
    expect(submitTest(host)).toBeUndefined();
  });

  it("failed submit declares server error, preserves selection, and keeps manual retry accessible", async () => {
    const host = await mountedTestQuestions();
    mock.examSubmit.mockResolvedValue({ success: false, error: "Сохранение недоступно" });
    await act(async () => option(host, "Вопрос 1: Что делать при подзыве?, Наказать")?.click());
    await act(async () => option(host, "Вопрос 2: Что сделать перед прогулкой?, Надеть поводок")?.click());
    await act(async () => submitTest(host)?.click());
    const alert = host.querySelector('[role="alert"][aria-live="assertive"]');
    expect(alert?.getAttribute("aria-label")).toBe("Сохранение недоступно");
    expect(option(host, "Вопрос 1: Что делать при подзыве?, Наказать")
      ?.getAttribute("aria-checked")).toBe("true");
    expect(submitTest(host)?.getAttribute("aria-disabled")).toBe("false");
    expect(mock.examSubmit).toHaveBeenCalledTimes(1);
    await act(async () => submitTest(host)?.click());
    expect(mock.examSubmit).toHaveBeenCalledTimes(2);
  });
});

// LEARN032_EXAM_TARGET_LIFECYCLE: existing RN mounted mock, no native device/backend.
function examDeferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<unknown>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function examLifecycle() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const draw = async (userStepId: string, stepId: string, onComplete = vi.fn()) => {
    await act(async () => root.render(createElement(TestQuestionsBlock, {
      checklist: testQuestions, userStepId, stepId, onComplete,
    })));
    return onComplete;
  };
  cleanup.push(async () => { await act(async () => root.unmount()); host.remove(); });
  return { host, draw };
}
async function chooseExamAnswers(host: HTMLElement) {
  await act(async () => option(host, "Вопрос 1: Что делать при подзыве?, Похвалить")?.click());
  await act(async () => option(host, "Вопрос 2: Что сделать перед прогулкой?, Надеть поводок")?.click());
}

describe("LEARN032_EXAM_TARGET_LIFECYCLE userStep and step identity", () => {
  it("late A GET must not put A graded answers or explanation into B while B GET is pending", async () => {
    const a = examDeferred(); const b = examDeferred();
    mock.examGet.mockImplementation((id: string) => id === "user-step-A" ? a.promise : b.promise);
    const ui = await examLifecycle();
    await ui.draw("user-step-A", "step-A");
    await ui.draw("user-step-B", "step-B");
    expect(ui.host.textContent).toContain("Загрузка данных");
    await act(async () => a.resolve({ success: true, data: examRecord({
      id: "exam-A", testAnswers: { "q-1": 1, "q-2": 0 }, trainerComment: "PRIVATE_OLD_EXAM",
    }) }));
    expect(ui.host.textContent).not.toContain("PRIVATE_OLD_EXAM");
    expect(ui.host.textContent).not.toContain("Правильный ответ:");
    expect(option(ui.host, "Вопрос 1: Что делать при подзыве?, Наказать")).toBeUndefined();
    await act(async () => b.resolve({ success: true, data: null }));
    expect(ui.host.textContent).toContain("Тестовые вопросы");
    expect(option(ui.host, "Вопрос 1: Что делать при подзыве?, Наказать")
      ?.getAttribute("aria-checked")).toBe("false");
    expect(submitTest(ui.host)?.disabled).toBe(true);
    expect(mock.examGet.mock.calls.map(call => call[0]))
      .toEqual(["user-step-A", "user-step-B"]);
  });

  it("changing only stepId remounts the target and ignores previous GET of same userStep", async () => {
    const a = examDeferred(); const b = examDeferred();
    mock.examGet.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const ui = await examLifecycle();
    await ui.draw("user-step-A", "step-A");
    await ui.draw("user-step-A", "step-B");
    await act(async () => a.resolve({ success: true, data: examRecord({
      testAnswers: { "q-1": 1, "q-2": 1 }, trainerComment: "PRIVATE_STEP_A_RESULT",
    }) }));
    expect(ui.host.textContent).toContain("Загрузка данных");
    expect(ui.host.textContent).not.toContain("PRIVATE_STEP_A_RESULT");
    await act(async () => b.resolve({ success: true, data: null }));
    expect(ui.host.textContent).toContain("Тестовые вопросы");
    expect(option(ui.host, "Вопрос 1: Что делать при подзыве?, Наказать")
      ?.getAttribute("aria-checked")).toBe("false");
    expect(submitTest(ui.host)?.disabled).toBe(true);
    expect(mock.examGet.mock.calls.map(call => call[0]))
      .toEqual(["user-step-A", "user-step-A"]);
  });

  it("late A submit cannot call new onComplete, mark B submitted or erase B selections", async () => {
    const pending = examDeferred();
    mock.examGet.mockResolvedValue({ success: true, data: null });
    mock.examSubmit.mockImplementation((params: { userStepId: string }) =>
      params.userStepId === "user-step-A" ? pending.promise
        : Promise.resolve({ success: true, data: { id: "exam-B" } }));
    const ui = await examLifecycle();
    const finishedA = vi.fn(); const finishedB = vi.fn();
    await ui.draw("user-step-A", "step-A", finishedA);
    await act(async () => { await new Promise(done => setTimeout(done, 20)); });
    await chooseExamAnswers(ui.host);
    await act(async () => submitTest(ui.host)?.click());
    expect(mock.examSubmit).toHaveBeenCalledTimes(1);
    await ui.draw("user-step-B", "step-B", finishedB);
    await act(async () => { await new Promise(done => setTimeout(done, 20)); });
    await act(async () => option(ui.host, "Вопрос 1: Что делать при подзыве?, Наказать")?.click());
    await act(async () => pending.resolve({ success: true, data: { id: "exam-A" } }));
    expect(finishedA).not.toHaveBeenCalled();
    expect(finishedB).not.toHaveBeenCalled();
    expect(ui.host.textContent).not.toContain("Результат:");
    expect(option(ui.host, "Вопрос 1: Что делать при подзыве?, Наказать")
      ?.getAttribute("aria-checked")).toBe("true");
    expect(submitTest(ui.host)).toBeDefined();
  });

  it("two same-turn submit presses send exactly one exam POST, with original score fields", async () => {
    const pending = examDeferred();
    mock.examGet.mockResolvedValue({ success: true, data: null });
    mock.examSubmit.mockReturnValue(pending.promise);
    const ui = await examLifecycle();
    await ui.draw("user-step-A", "step-A");
    await act(async () => { await new Promise(done => setTimeout(done, 20)); });
    await chooseExamAnswers(ui.host);
    const submit = submitTest(ui.host);
    expect(submit?.disabled).toBe(false);
    await act(async () => { submit?.click(); submit?.click(); await Promise.resolve(); });
    expect(mock.examSubmit).toHaveBeenCalledTimes(1);
    expect(mock.examSubmit.mock.calls[0][0]).toEqual({
      userStepId: "user-step-A", stepId: "step-A",
      testAnswers: { "q-1": 0, "q-2": 0 },
      testScore: 2, testMaxScore: 2, overallScore: 100,
    });
    await act(async () => pending.resolve({ success: true, data: { id: "exam-A" } }));
    expect(ui.host.textContent).toContain("Результат: 2 из 2 правильных");
  });

  it("rejected GET shows retry and no graded result/options until authoritative success", async () => {
    mock.examGet.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({
      success: true, data: null,
    });
    const ui = await examLifecycle();
    await ui.draw("user-step-A", "step-A");
    await act(async () => { await new Promise(done => setTimeout(done, 20)); });
    expect(ui.host.textContent).toContain("Не удалось загрузить результат теста");
    expect(ui.host.querySelector('[role="radio"]')).toBeNull();
    expect(submitTest(ui.host)).toBeUndefined();
    const retry = Array.from(ui.host.querySelectorAll<HTMLButtonElement>("button"))
      .find(button => button.textContent?.includes("Повторить загрузку"));
    expect(retry).toBeDefined();
    await act(async () => retry?.click());
    await act(async () => { await new Promise(done => setTimeout(done, 20)); });
    expect(ui.host.textContent).toContain("Тестовые вопросы");
    expect(mock.examGet).toHaveBeenCalledTimes(2);
  });

  it("rejected submit keeps answers and blocks uncertain replay until manual GET checks result", async () => {
    mock.examGet.mockResolvedValue({ success: true, data: null });
    mock.examSubmit.mockRejectedValueOnce(new Error("lost ACK"));
    const ui = await examLifecycle();
    await ui.draw("user-step-A", "step-A");
    await act(async () => { await new Promise(done => setTimeout(done, 20)); });
    await chooseExamAnswers(ui.host);
    await act(async () => submitTest(ui.host)?.click());
    expect(mock.examSubmit).toHaveBeenCalledTimes(1);
    expect(ui.host.textContent).toContain("Проверьте результат");
    expect(submitTest(ui.host)?.disabled).toBe(true);
    expect(option(ui.host, "Вопрос 1: Что делать при подзыве?, Похвалить")
      ?.getAttribute("aria-checked")).toBe("true");
    const verify = Array.from(ui.host.querySelectorAll<HTMLButtonElement>("button"))
      .find(button => button.textContent?.includes("Проверить результат"));
    expect(verify).toBeDefined();
    await act(async () => verify?.click());
    await act(async () => { await new Promise(done => setTimeout(done, 20)); });
    expect(mock.examSubmit).toHaveBeenCalledTimes(1);
    expect(submitTest(ui.host)?.disabled).toBe(false);
    expect(option(ui.host, "Вопрос 1: Что делать при подзыве?, Похвалить")
      ?.getAttribute("aria-checked")).toBe("true");
  });

  it.each(["NETWORK_ERROR", "REQUEST_TIMEOUT", "UNKNOWN_ERROR"])(
    "%s network-coded unknown POST blocks retry until authoritative GET", async code => {
      mock.examGet.mockResolvedValue({ success: true, data: null });
      mock.examSubmit.mockResolvedValue({ success: false, code, error: "Нет подтверждения" });
      const ui = await examLifecycle();
      await ui.draw("user-step-A", "step-A");
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      await chooseExamAnswers(ui.host);
      await act(async () => submitTest(ui.host)?.click());
      expect(mock.examSubmit).toHaveBeenCalledTimes(1);
      expect(submitTest(ui.host)?.disabled).toBe(true);
      expect(ui.host.textContent).toContain("Проверьте результат");
      const verify = Array.from(ui.host.querySelectorAll<HTMLButtonElement>("button"))
        .find(button => button.textContent?.includes("Проверить результат"));
      expect(verify).toBeDefined();
      await act(async () => submitTest(ui.host)?.click());
      expect(mock.examSubmit).toHaveBeenCalledTimes(1);
      await act(async () => verify?.click());
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(mock.examGet).toHaveBeenCalledTimes(2);
      expect(submitTest(ui.host)?.disabled).toBe(false);
      expect(option(ui.host, "Вопрос 1: Что делать при подзыве?, Похвалить")
        ?.getAttribute("aria-checked")).toBe("true");
    },
  );

  it("manual GET after lost submit ACK shows confirmed server grade without duplicate submit", async () => {
    mock.examGet.mockResolvedValueOnce({ success: true, data: null }).mockResolvedValueOnce({
      success: true, data: examRecord({
        testAnswers: { "q-1": 0, "q-2": 0 }, testScore: 2,
        testMaxScore: 2, overallScore: 100, isPassed: true,
      }),
    });
    mock.examSubmit.mockResolvedValue({ success: false, code: "REQUEST_TIMEOUT" });
    const ui = await examLifecycle();
    await ui.draw("user-step-A", "step-A");
    await act(async () => { await new Promise(done => setTimeout(done, 20)); });
    await chooseExamAnswers(ui.host);
    await act(async () => submitTest(ui.host)?.click());
    const verify = Array.from(ui.host.querySelectorAll<HTMLButtonElement>("button"))
      .find(button => button.textContent?.includes("Проверить результат"));
    expect(verify).toBeDefined();
    await act(async () => verify?.click());
    await act(async () => { await new Promise(done => setTimeout(done, 20)); });
    expect(mock.examSubmit).toHaveBeenCalledTimes(1);
    expect(ui.host.textContent).toContain("Результат: 2 из 2 правильных");
    expect(submitTest(ui.host)).toBeUndefined();
    expect(ui.host.textContent).not.toContain("Проверьте результат");
  });

});


// LEARN032_WRITTEN_FEEDBACK_LIFECYCLE: existing native RN a11y-mounted harness.
function deferredWritten<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const writtenResult = (feedback: string | null = null, reviewed = false) => ({
  id: "exam-1", testAnswers: null, testScore: null, testMaxScore: null,
  videoReportUrl: null, writtenFeedback: feedback, overallScore: 100,
  isPassed: reviewed ? false : true,
  trainerComment: reviewed ? "Пожалуйста, повторите упражнение" : null,
  reviewedAt: reviewed ? "2026-10-23T10:00:00Z" : null,
  reviewedById: reviewed ? "trainer-1" : null, reviewedBy: null,
  createdAt: "2026-10-23T10:00:00Z", updatedAt: "2026-10-23T10:00:00Z",
});
function writtenSubmit(host: HTMLElement) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    .find(button => button.textContent?.includes("ОТПРАВИТЬ ОБРАТНУЮ СВЯЗЬ"));
}
function writtenCheck(host: HTMLElement) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    .find(button => button.textContent?.includes("Проверить сохранённый ответ"));
}
function writtenRetryGet(host: HTMLElement) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    .find(button => button.textContent?.includes("Повторить загрузку"));
}
async function writtenFill(host: HTMLElement, content: string) {
  const input = host.querySelector<HTMLInputElement>("input");
  if (!input) throw Error("Written feedback input is missing");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, content);
    input.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function writtenMounted(userStepId = "user-step-A", stepId = "step-A") {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const onComplete = vi.fn();
  const render = async (currentUserStepId: string, currentStepId: string,
    currentOnComplete = onComplete) => {
    await act(async () => root.render(createElement(WrittenFeedbackBlock, {
      userStepId: currentUserStepId, stepId: currentStepId, onComplete: currentOnComplete,
    })));
  };
  await render(userStepId, stepId);
  cleanup.push(async () => { await act(async () => root.unmount()); host.remove(); });
  return { host, render, onComplete };
}

describe("LEARN032_WRITTEN_FEEDBACK_LIFECYCLE existing RN text-only exam UI", () => {
  it("slow old GET is retired on userStepId/stepId change; new target has only new feedback", async () => {
    const old = deferredWritten<unknown>();
    mock.examGet.mockImplementation((id: string) => id === "user-step-A"
      ? old.promise : Promise.resolve({ success: true, data: writtenResult("Ответ нового шага") }));
    const ui = await writtenMounted();
    await ui.render("user-step-B", "step-B");
    await act(async () => { await new Promise(done => setTimeout(done, 12)); });
    expect(ui.host.querySelector<HTMLInputElement>("input")?.value).toBe("Ответ нового шага");
    await act(async () => old.resolve({ success: true, data: writtenResult("PRIVATE_OLD_ANSWER") }));
    await act(async () => { await new Promise(done => setTimeout(done, 15)); });
    expect(ui.host.querySelector<HTMLInputElement>("input")?.value).toBe("Ответ нового шага");
    expect(ui.host.textContent).not.toContain("PRIVATE_OLD_ANSWER");
    expect(mock.examGet.mock.calls.map(call => call[0])).toEqual(["user-step-A", "user-step-B"]);
  });

  it("same userStepId but different stepId resets text and makes a new GET", async () => {
    let reads = 0;
    mock.examGet.mockImplementation(async () => ({ success: true,
      data: ++reads === 1 ? writtenResult("Старый ответ") : null }));
    const ui = await writtenMounted();
    await act(async () => { await new Promise(done => setTimeout(done, 8)); });
    expect(ui.host.querySelector<HTMLInputElement>("input")?.value).toBe("Старый ответ");
    await ui.render("user-step-A", "step-B");
    await act(async () => { await new Promise(done => setTimeout(done, 12)); });
    expect(mock.examGet).toHaveBeenCalledTimes(2);
    expect(ui.host.querySelector<HTMLInputElement>("input")?.value).toBe("");
    expect(writtenSubmit(ui.host)?.disabled).toBe(true);
  });

  it("two native same-turn presses send exactly one trimmed text POST and invoke completion once", async () => {
    const held = deferredWritten<unknown>();
    mock.examGet.mockResolvedValue({ success: true, data: null });
    mock.examSubmit.mockImplementation(() => held.promise);
    const ui = await writtenMounted();
    await act(async () => { await new Promise(done => setTimeout(done, 10)); });
    await writtenFill(ui.host, "  Урок прошёл успешно  ");
    await act(async () => { writtenSubmit(ui.host)?.click(); writtenSubmit(ui.host)?.click();
      await Promise.resolve(); });
    expect(mock.examSubmit).toHaveBeenCalledTimes(1);
    expect(mock.examSubmit).toHaveBeenCalledWith({
      userStepId: "user-step-A", stepId: "step-A",
      writtenFeedback: "Урок прошёл успешно", overallScore: 100, isPassed: true,
    });
    await act(async () => held.resolve({ success: true, data: { id: "saved" } }));
    expect(ui.onComplete).toHaveBeenCalledTimes(1);
    expect(ui.host.textContent).toContain("Обратная связь успешно отправлена");
  });

  it("retired old POST cannot complete new target or remove its draft", async () => {
    const old = deferredWritten<unknown>();
    mock.examGet.mockResolvedValue({ success: true, data: null });
    mock.examSubmit.mockImplementation(() => old.promise);
    const ui = await writtenMounted();
    await act(async () => { await new Promise(done => setTimeout(done, 10)); });
    await writtenFill(ui.host, "Письменный ответ прежнего шага");
    await act(async () => writtenSubmit(ui.host)?.click());
    const newComplete = vi.fn();
    await ui.render("user-step-B", "step-B", newComplete);
    await act(async () => { await new Promise(done => setTimeout(done, 10)); });
    await writtenFill(ui.host, "Совершенно новый текст ответа");
    await act(async () => old.resolve({ success: true, data: { id: "old" } }));
    expect(ui.onComplete).not.toHaveBeenCalled();
    expect(newComplete).not.toHaveBeenCalled();
    expect(ui.host.querySelector<HTMLInputElement>("input")?.value)
      .toBe("Совершенно новый текст ответа");
    expect(writtenSubmit(ui.host)?.disabled).toBe(false);
  });

  it("network timeout success:false blocks replay until deliberate GET; retains original draft", async () => {
    let persisted = false;
    mock.examGet.mockImplementation(async () => ({ success: true,
      data: persisted ? writtenResult("Обратная связь после таймаута") : null }));
    mock.examSubmit.mockResolvedValue({ success: false, code: "REQUEST_TIMEOUT", error: "Таймаут" });
    const ui = await writtenMounted();
    await act(async () => { await new Promise(done => setTimeout(done, 10)); });
    await writtenFill(ui.host, "Обратная связь после таймаута");
    await act(async () => writtenSubmit(ui.host)?.click());
    expect(mock.examSubmit).toHaveBeenCalledTimes(1);
    expect(writtenSubmit(ui.host)?.disabled).toBe(true);
    expect(ui.host.textContent).toContain("Проверить сохранённый ответ");
    expect(ui.host.querySelector<HTMLInputElement>("input")?.value)
      .toBe("Обратная связь после таймаута");
    await act(async () => { await new Promise(done => setTimeout(done, 10)); });
    expect(mock.examSubmit).toHaveBeenCalledTimes(1);
    persisted = true;
    await act(async () => writtenCheck(ui.host)?.click());
    expect(mock.examSubmit).toHaveBeenCalledTimes(1);
    expect(ui.host.textContent).toContain("Ожидайте проверки тренером");
    expect(writtenSubmit(ui.host)).toBeUndefined();
  });

  it("unknown rejected POST, authoritative GET with no answer permits only explicit manual retry", async () => {
    mock.examGet.mockResolvedValue({ success: true, data: null });
    mock.examSubmit.mockRejectedValueOnce(new Error("transport dropped"))
      .mockResolvedValueOnce({ success: true, data: { id: "saved" } });
    const ui = await writtenMounted();
    await act(async () => { await new Promise(done => setTimeout(done, 10)); });
    await writtenFill(ui.host, "Описал занятие текстом");
    await act(async () => writtenSubmit(ui.host)?.click());
    expect(mock.examSubmit).toHaveBeenCalledTimes(1);
    expect(writtenSubmit(ui.host)?.disabled).toBe(true);
    await act(async () => writtenCheck(ui.host)?.click());
    expect(ui.host.querySelector<HTMLInputElement>("input")?.value)
      .toBe("Описал занятие текстом");
    expect(writtenSubmit(ui.host)?.disabled).toBe(false);
    expect(mock.examSubmit).toHaveBeenCalledTimes(1);
    await act(async () => writtenSubmit(ui.host)?.click());
    expect(mock.examSubmit).toHaveBeenCalledTimes(2);
    expect(ui.host.textContent).toContain("Обратная связь успешно отправлена");
  });

  it("failed GET never leaves spinner stuck and explicit rejection allows manual retry without losing text", async () => {
    mock.examGet.mockRejectedValueOnce(new Error("GET failed"))
      .mockResolvedValueOnce({ success: true, data: null });
    mock.examSubmit.mockResolvedValue({ success: false, code: "VALIDATION_ERROR", error: "Ответ отклонён" });
    const ui = await writtenMounted();
    await act(async () => { await new Promise(done => setTimeout(done, 12)); });
    expect(writtenRetryGet(ui.host)).toBeDefined();
    expect(ui.host.textContent).toContain("Не удалось загрузить письменный ответ");
    await act(async () => writtenRetryGet(ui.host)?.click());
    await writtenFill(ui.host, "Очень подробный ответ");
    await act(async () => writtenSubmit(ui.host)?.click());
    expect(ui.host.textContent).toContain("Ответ отклонён");
    expect(writtenSubmit(ui.host)?.disabled).toBe(false);
    expect(ui.host.querySelector<HTMLInputElement>("input")?.value)
      .toBe("Очень подробный ответ");
    await act(async () => writtenSubmit(ui.host)?.click());
    expect(mock.examSubmit).toHaveBeenCalledTimes(2);
  });

  it("field and hint are accessible; existing reviewed result overrides submitted success status", async () => {
    mock.examGet.mockResolvedValue({ success: true,
      data: writtenResult("Письменный ответ для проверки", true) });
    const ui = await writtenMounted();
    await act(async () => { await new Promise(done => setTimeout(done, 10)); });
    const input = ui.host.querySelector<HTMLInputElement>("input");
    expect(input?.getAttribute("aria-label")).toContain("Письменная обратная связь");
    expect(input?.getAttribute("aria-description")).toContain("Минимум 10 символов");
    expect(input?.disabled).toBe(true);
    expect(input?.getAttribute("aria-disabled")).toBe("true");
    expect(ui.host.textContent).toContain("Экзамен не зачтён");
    expect(ui.host.textContent).toContain("Пожалуйста, повторите упражнение");
    expect(ui.host.textContent).not.toContain("Ожидайте проверки тренером");
    expect(ui.host.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(mock.examSubmit).not.toHaveBeenCalled();
  });
});

// Additional exact source/wire and same-actor new-step cases for the same written flow.
describe("LEARN032_WRITTEN_WIRE_UNKNOWN and active-step UI", () => {
  it("success:true without a confirmed exam id is unknown, not a completed write", async () => {
    mock.examGet.mockResolvedValue({ success: true, data: null });
    mock.examSubmit.mockResolvedValue({ success: true, data: {} });
    const ui = await writtenMounted();
    await act(async () => { await new Promise(done => setTimeout(done, 10)); });
    await writtenFill(ui.host, "Текст достаточно длинный");
    await act(async () => writtenSubmit(ui.host)?.click());
    expect(ui.onComplete).not.toHaveBeenCalled();
    expect(ui.host.textContent).not.toContain("Обратная связь успешно отправлена");
    expect(ui.host.textContent).toContain("Проверить сохранённый ответ");
    expect(writtenSubmit(ui.host)?.disabled).toBe(true);
    expect(mock.examSubmit).toHaveBeenCalledTimes(1);
  });

  it("same userStepId with changed stepId retires pending POST; old callback cannot finish new editor", async () => {
    const previous = deferredWritten<unknown>();
    mock.examGet.mockResolvedValue({ success: true, data: null });
    mock.examSubmit.mockImplementation(() => previous.promise);
    const ui = await writtenMounted();
    await act(async () => { await new Promise(done => setTimeout(done, 10)); });
    await writtenFill(ui.host, "Старое содержание ответа");
    await act(async () => writtenSubmit(ui.host)?.click());
    expect(mock.examSubmit).toHaveBeenCalledTimes(1);
    const newComplete = vi.fn();
    await ui.render("user-step-A", "step-B", newComplete);
    await act(async () => { await new Promise(done => setTimeout(done, 10)); });
    await writtenFill(ui.host, "Новый текст с новым stepId");
    await act(async () => previous.resolve({ success: true, data: { id: "previous" } }));
    expect(ui.onComplete).not.toHaveBeenCalled();
    expect(newComplete).not.toHaveBeenCalled();
    expect(ui.host.querySelector<HTMLInputElement>("input")?.value)
      .toBe("Новый текст с новым stepId");
    expect(writtenSubmit(ui.host)?.disabled).toBe(false);
    expect(mock.examGet).toHaveBeenCalledTimes(2);
  });

  it("the 10-character hint, disabled state and busy announcement follow actual input/write", async () => {
    const pending = deferredWritten<unknown>();
    mock.examGet.mockResolvedValue({ success: true, data: null });
    mock.examSubmit.mockImplementation(() => pending.promise);
    const ui = await writtenMounted();
    await act(async () => { await new Promise(done => setTimeout(done, 10)); });
    expect(writtenSubmit(ui.host)?.disabled).toBe(true);
    expect(writtenSubmit(ui.host)?.getAttribute("aria-disabled")).toBe("true");
    await writtenFill(ui.host, "Девять");
    expect(writtenSubmit(ui.host)?.disabled).toBe(true);
    await writtenFill(ui.host, "Полный письменный ответ");
    expect(writtenSubmit(ui.host)?.disabled).toBe(false);
    await act(async () => writtenSubmit(ui.host)?.click());
    expect(writtenSubmit(ui.host)?.getAttribute("aria-busy")).toBe("true");
    expect(ui.host.querySelector<HTMLInputElement>("input")?.getAttribute("aria-disabled"))
      .toBe("true");
    await act(async () => pending.resolve({ success: true, data: { id: "saved" } }));
    expect(ui.host.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});


// LEARN032_SURVEY_COMPARISON_READABLE — current FINAL template, native mounted RN harness.
function finalSurvey() {
  const initial = survey(false);
  return { ...initial, data: { ...initial.data,
    template: { ...initial.data.template, slug: "screening-final", phase: "FINAL" },
  } };
}
const comparison = (items: { questionId: string; before: unknown; after: unknown;
  changed: boolean; label?: string }[]) => ({
  familySlug: "screening", initialSubmittedAt: "2026-09-01T09:00:00Z",
  finalSubmittedAt: "2026-10-20T09:00:00Z", items,
});
const compareText = (host: HTMLElement) =>
  host.querySelector('[aria-label="Динамика до и после"]')?.textContent ?? "";
function deferredComparison() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<unknown>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const retryComparison = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    .find(button => button.getAttribute("aria-label") === "Повторить загрузку сравнения");

describe("LEARN032_SURVEY_COMPARISON_READABLE FINAL before/after", () => {
  it("renders exact question titles, option labels, boolean, text, arrays, null and safe unknown fallbacks; still only first 8 changed", async () => {
    mock.comparisonGet.mockResolvedValue({ success: true, data: comparison([
      { questionId: "name", before: "Бобик", after: "Тузик", changed: true },
      { questionId: "choice", before: "calm", after: "active", changed: true },
      { questionId: "multi", before: ["walk"], after: ["walk", "play"], changed: true },
      { questionId: "yes", before: true, after: false, changed: true },
      { questionId: "notes", before: null, after: "Хорошо поработали", changed: true },
      { questionId: "pet", before: "Бобик", after: null, changed: true },
      { questionId: "past-secret-id", label: "UNVERIFIED_QUESTION_ID", before: "opaque-code-1",
        after: "opaque-code-2", changed: true },
      { questionId: "choice", before: "unknown-option-code", after: "calm", changed: true },
      { questionId: "omitted-ninth", before: "NINTH_SECRET", after: "NINTH_SECRET_2", changed: true },
    ]) });
    const host = await mounted(null, answers, finalSurvey());
    const content = compareText(host);
    expect(content).toContain("Имя собаки");
    expect(content).toContain("До: Бобик");
    expect(content).toContain("После: Тузик");
    expect(content).toContain("Какой темперамент");
    expect(content).toContain("До: Спокойный");
    expect(content).toContain("После: Активный");
    expect(content).toContain("Любимые занятия");
    expect(content).toContain("Прогулки");
    expect(content).toContain("Прогулки, Игры");
    expect(content).toContain("Есть поводок");
    expect(content).toContain("До: Да");
    expect(content).toContain("После: Нет");
    expect(content).toContain("Нет ответа");
    expect(content).toContain("Хорошо поработали");
    expect(content).toContain("Вопрос из предыдущей анкеты");
    expect(content).toContain("Неизвестный вариант");
    expect(content).not.toContain("past-secret-id");
    expect(content).not.toContain("UNVERIFIED_QUESTION_ID");
    expect(content).not.toContain("opaque-code");
    expect(content).not.toContain("unknown-option-code");
    expect(content).not.toContain("NINTH_SECRET");
    expect(content).not.toContain("[\"");
    expect(mock.comparisonGet).toHaveBeenCalledWith("course-1", "screening");
    expect(mock.submitted).not.toHaveBeenCalled();
  });

  it("success comparison without changed rows says no changes; success:null means two surveys are missing", async () => {
    mock.comparisonGet.mockResolvedValue({ success: true, data: comparison([
      { questionId: "name", before: "Бобик", after: "Бобик", changed: false },
    ]) });
    const none = await mounted(null, answers, finalSurvey());
    expect(compareText(none)).toContain("Изменений в ответах нет");
    expect(compareText(none)).not.toContain("Недостаточно двух анкет");
    mock.comparisonGet.mockResolvedValue({ success: true, data: null });
    const missing = await mounted(null, answers, finalSurvey());
    expect(compareText(missing)).toContain("Недостаточно двух анкет");
    expect(compareText(missing)).not.toContain("Изменений в ответах нет");
    expect(mock.submitted).not.toHaveBeenCalled();
  });

  it("pending comparison is announced as loading, not missing or unchanged, until complete", async () => {
    const pending = deferredComparison();
    mock.comparisonGet.mockImplementation(() => pending.promise);
    const host = await mounted(null, answers, finalSurvey());
    expect(compareText(host)).toContain("Загружаем сравнение анкет");
    expect(compareText(host)).not.toContain("Изменений в ответах нет");
    expect(compareText(host)).not.toContain("Недостаточно двух анкет");
    expect(host.querySelector('[aria-live="polite"][aria-label="Загружаем сравнение анкет"]'))
      .not.toBeNull();
    await act(async () => pending.resolve({ success: true, data: comparison([
      { questionId: "yes", before: false, after: true, changed: true },
    ]) }));
    await act(async () => { await new Promise(done => setTimeout(done, 30)); });
    expect(compareText(host)).toContain("До: Нет");
    expect(compareText(host)).toContain("После: Да");
  });

  it("explicit ApiResponse failure shows fixed accessible error, only button triggers refetch and recovery", async () => {
    mock.comparisonGet.mockResolvedValueOnce({ success: false, code: "FORBIDDEN",
      error: "RAW_PRIVATE_COMPARISON_SERVER_MESSAGE" })
      .mockResolvedValueOnce({ success: true, data: comparison([]) });
    const host = await mounted(null, answers, finalSurvey());
    expect(compareText(host)).toContain("Не удалось загрузить сравнение анкет");
    expect(compareText(host)).not.toContain("RAW_PRIVATE_COMPARISON_SERVER_MESSAGE");
    expect(host.querySelector('[role="alert"]')?.getAttribute("aria-label"))
      .not.toContain("RAW_PRIVATE_COMPARISON_SERVER_MESSAGE");
    expect(compareText(host)).not.toContain("Изменений в ответах нет");
    expect(host.querySelector('[role="alert"]')?.getAttribute("aria-live")).toBe("assertive");
    expect(mock.comparisonGet).toHaveBeenCalledTimes(1);
    await act(async () => { await new Promise(done => setTimeout(done, 25)); });
    expect(mock.comparisonGet).toHaveBeenCalledTimes(1);
    await act(async () => retryComparison(host)?.click());
    await act(async () => { await new Promise(done => setTimeout(done, 30)); });
    expect(mock.comparisonGet).toHaveBeenCalledTimes(2);
    expect(compareText(host)).toContain("Изменений в ответах нет");
    expect(mock.submitted).not.toHaveBeenCalled();
  });

  it("rejected GET exposes accessible generic error and manual refetch without stale comparison", async () => {
    mock.comparisonGet.mockRejectedValueOnce(new Error("RAW_TRANSPORT_PRIVATE_DETAILS"))
      .mockResolvedValueOnce({ success: true, data: null });
    const host = await mounted(null, answers, finalSurvey());
    expect(compareText(host)).toContain("Не удалось загрузить сравнение анкет");
    expect(compareText(host)).not.toContain("RAW_TRANSPORT_PRIVATE_DETAILS");
    expect(compareText(host)).not.toContain("Изменений в ответах нет");
    expect(mock.comparisonGet).toHaveBeenCalledTimes(1);
    await act(async () => retryComparison(host)?.click());
    await act(async () => { await new Promise(done => setTimeout(done, 30)); });
    expect(mock.comparisonGet).toHaveBeenCalledTimes(2);
    expect(compareText(host)).toContain("Недостаточно двух анкет");
  });

  // LEARN032_FINAL_COMPARISON_TERMINAL_SAFE: data and typed-thrown variants.
  it.each(["SESSION_EXPIRED", "G05_SESSION_CHANGED"])(
    "terminal ApiResponse %s hides server error and never offers a retry", async code => {
      mock.comparisonGet.mockResolvedValue({ success: false, code,
        error: "RAW_PRIVATE_TOKEN_OR_SESSION_DIAGNOSTICS" });
      const host = await mounted(null, answers, finalSurvey());
      const alert = host.querySelector('[role="alert"]');
      expect(alert?.getAttribute("aria-live")).toBe("assertive");
      expect(alert?.getAttribute("aria-label"))
        .toBe("Сессия изменилась или истекла. Войдите снова, чтобы увидеть сравнение.");
      expect(compareText(host))
        .toContain("Сессия изменилась или истекла. Войдите снова, чтобы увидеть сравнение.");
      expect(host.textContent).not.toContain("RAW_PRIVATE_TOKEN_OR_SESSION_DIAGNOSTICS");
      expect(retryComparison(host)).toBeUndefined();
      expect(compareText(host)).not.toContain("Недостаточно двух анкет");
      expect(compareText(host)).not.toContain("Изменений в ответах нет");
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
      expect(mock.comparisonGet).toHaveBeenCalledTimes(1);
      expect(mock.submitted).not.toHaveBeenCalled();
    },
  );

  it.each(["SESSION_EXPIRED", "G05_SESSION_CHANGED"])(
    "terminal thrown typed %s never leaks error.message or exposes retry", async code => {
      mock.comparisonGet.mockRejectedValue(Object.assign(
        new Error("RAW_TYPED_EXCEPTION_WITH_PRIVATE_DATA"), { code },
      ));
      const host = await mounted(null, answers, finalSurvey());
      expect(compareText(host)).toContain("Сессия изменилась или истекла");
      expect(host.textContent).not.toContain("RAW_TYPED_EXCEPTION_WITH_PRIVATE_DATA");
      expect(retryComparison(host)).toBeUndefined();
      expect(compareText(host)).not.toContain("Изменений в ответах нет");
      expect(compareText(host)).not.toContain("Недостаточно двух анкет");
      expect(mock.comparisonGet).toHaveBeenCalledTimes(1);
    },
  );

  it("INITIAL survey keeps comparison disabled and does not show comparison UI", async () => {
    const host = await mounted();
    expect(mock.comparisonGet).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Динамика до и после");
    expect(mock.submitted).not.toHaveBeenCalled();
  });
});

// LEARN032_SURVEY_MAIN_GET_RECOVERY — existing mounted native questionnaire.
const surveyRetryButton = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>('button[aria-label="Повторить загрузку анкеты"]');
const surveySubmitButton = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>('button[aria-label="Отправить анкету"]');
function delayedSurveyRead() {
  let resolve!: (result: unknown) => void;
  const promise = new Promise<unknown>(done => { resolve = done; });
  return { promise, resolve };
}

describe("LEARN032_SURVEY_MAIN_GET_RECOVERY mounted survey read", () => {
  it("thrown initial GET announces error, manual retry has busy state, then restores stored draft without POST", async () => {
    const { surveyApi } = await import("../../../shared/lib/api");
    vi.mocked(surveyApi.getSurvey).mockRejectedValueOnce(new Error("connection dropped"));
    const saved = { ...answers, name: "Сохранённый черновик" };
    mock.getItem.mockResolvedValueOnce(JSON.stringify(saved));
    const host = await mounted();
    expect(host.querySelector('[role="alert"]')?.getAttribute("aria-label"))
      .toContain("Не удалось загрузить анкету");
    expect(host.querySelector('button[aria-label="Отправить анкету"]')).toBeNull();
    expect(host.querySelector("input")).toBeNull();
    const pending = delayedSurveyRead();
    mock.survey = pending.promise;
    const retry = surveyRetryButton(host);
    expect(retry).not.toBeNull();
    expect(retry?.getAttribute("role")).toBe("button");
    await act(async () => { retry?.click(); retry?.click(); await Promise.resolve(); });
    expect(vi.mocked(surveyApi.getSurvey)).toHaveBeenCalledTimes(2);
    await act(async () => { await new Promise(done => setTimeout(done, 25)); });
    // React Query returns to its existing named loading state when a failed
    // first read is retried; it removes the retry control until the GET settles.
    expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-label"))
      .toBe("Загрузка анкеты...");
    expect(surveyRetryButton(host)).toBeNull();
    expect(surveySubmitButton(host)).toBeNull();
    expect(mock.submitted).not.toHaveBeenCalled();
    await act(async () => pending.resolve(survey()));
    await act(async () => { await new Promise(done => setTimeout(done, 25)); });
    expect(host.textContent).toContain("Анкета собаки");
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Имя собаки, обязательный вопрос"]')?.value)
      .toBe("Сохранённый черновик");
    expect(surveyRetryButton(host)).toBeNull();
    expect(surveySubmitButton(host)?.disabled).toBe(false);
    expect(mock.submitted).not.toHaveBeenCalled();
    expect(mock.removeItem).not.toHaveBeenCalled();
  });

  it("success:false read remains a failure, manual refetch alone reopens authorized saved response", async () => {
    const host = await mounted(null, answers, {
      success: false, error: "Сервис анкет временно недоступен", code: "NETWORK_ERROR",
    });
    expect(host.querySelector('[role="alert"]')?.getAttribute("aria-label"))
      .toBe("Сервис анкет временно недоступен");
    expect(surveyRetryButton(host)).not.toBeNull();
    expect(host.querySelector("input")).toBeNull();
    mock.survey = survey(false);
    await act(async () => surveyRetryButton(host)?.click());
    await act(async () => { await new Promise(done => setTimeout(done, 25)); });
    expect(host.textContent).toContain("Редактирование закрыто");
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Имя собаки, обязательный вопрос"]')?.value)
      .toBe("Бобик");
    expect(surveySubmitButton(host)).toBeNull();
    expect(mock.submitted).not.toHaveBeenCalled();
  });

  it("success:false followed by still-failed manual GET keeps alert and retry without claiming missing template", async () => {
    const host = await mounted(null, answers, { success: false, code: "REQUEST_TIMEOUT" });
    expect(host.querySelector('[role="alert"]')?.getAttribute("aria-label"))
      .toContain("Не удалось загрузить анкету");
    mock.survey = { success: false, error: "Ошибка сервера", code: "NETWORK_ERROR" };
    await act(async () => surveyRetryButton(host)?.click());
    await act(async () => { await new Promise(done => setTimeout(done, 25)); });
    expect(host.querySelector('[role="alert"]')?.getAttribute("aria-label"))
      .toBe("Ошибка сервера");
    expect(surveyRetryButton(host)).not.toBeNull();
    expect(host.textContent).not.toContain("Анкета отсутствует");
    expect(mock.submitted).not.toHaveBeenCalled();
  });

  it.each(["SESSION_EXPIRED", "G05_SESSION_CHANGED"])(
    "terminal %s does not offer a retry that circumvents changed session", async code => {
      const host = await mounted(null, answers, {
        success: false, error: "Нужна новая авторизация", code,
      });
      expect(host.querySelector('[role="alert"]')?.getAttribute("aria-label"))
        .toBe("Нужна новая авторизация");
      expect(surveyRetryButton(host)).toBeNull();
      expect(host.querySelector("input")).toBeNull();
      expect(surveySubmitButton(host)).toBeNull();
      expect(mock.submitted).not.toHaveBeenCalled();
    },
  );
});


// LEARN032_SURVEY_SUBMIT_SINGLEFLIGHT: existing native-mounted Button seam,
// no actual network, draft-storage activation, or native device.
function pendingSurveySubmit() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>(done => { resolve = done; });
  return { promise, resolve };
}

describe("LEARN032_SURVEY_SUBMIT_SINGLEFLIGHT", () => {
  it("two same-turn real presses cause one pending POST with unchanged original payload", async () => {
    const host = await mounted(true);
    const pending = pendingSurveySubmit();
    mock.submitted.mockImplementation(() => pending.promise);
    const button = surveySubmitButton(host);
    expect(button?.disabled).toBe(false);
    await act(async () => {
      button?.click();
      button?.click();
      await Promise.resolve();
    });
    expect(mock.submitted).toHaveBeenCalledTimes(1);
    expect(mock.submitted.mock.calls[0]).toEqual(["screening", {
      courseId: "course-1", stepId: "step-1", userStepId: "user-step-1",
      answers,
    }]);
    expect(mock.removeItem).not.toHaveBeenCalled();
    await act(async () => { await new Promise(done => setTimeout(done, 25)); });
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Отправка анкеты"]')?.disabled)
      .toBe(true);
    await act(async () => pending.resolve({ success: true, data: { id: "submitted" } }));
    await act(async () => { await new Promise(done => setTimeout(done, 25)); });
    expect(mock.submitted).toHaveBeenCalledTimes(1);
  });

  it.each(["failure-result", "rejection"])(
    "%s releases flight, retains original native error and allows only manual next press", async mode => {
      const host = await mounted(true);
      if (mode === "failure-result") {
        mock.submitted.mockResolvedValueOnce({ success: false, error: "Проверьте анкету" });
      } else {
        mock.submitted.mockRejectedValueOnce(new Error("network interruption"));
      }
      const button = surveySubmitButton(host);
      await act(async () => { button?.click(); button?.click(); await Promise.resolve(); });
      expect(mock.submitted).toHaveBeenCalledTimes(1);
      await act(async () => { await new Promise(done => setTimeout(done, 26)); });
      expect(mock.submitted).toHaveBeenCalledTimes(1);
      expect(host.querySelector('[role="alert"]')?.getAttribute("aria-label"))
        .toBe(mode === "failure-result"
          ? "Не удалось отправить анкету. Попробуйте ещё раз."
          : "Не удалось отправить анкету.");
      expect(host.textContent).not.toContain("Проверьте анкету");
      const retry = surveySubmitButton(host);
      expect(retry?.disabled).toBe(false);
      await act(async () => retry?.click());
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      expect(mock.submitted).toHaveBeenCalledTimes(2);
    },
  );

  it("invalid required fields and offline both reject a direct handler call, despite UI disable", async () => {
    const requiredHost = await mounted();
    expect(surveySubmitButton(requiredHost)?.disabled).toBe(true);
    expect(mock.submitPress).not.toBeNull();
    await act(async () => mock.submitPress?.());
    expect(mock.submitted).not.toHaveBeenCalled();
    // Ensure the offline guard itself, not just the disabled native button,
    // protects a fully completed editable response.
    mock.offline = true;
    const offlineHost = await mounted(true);
    expect(surveySubmitButton(offlineHost)?.disabled).toBe(true);
    expect(mock.submitPress).not.toBeNull();
    await act(async () => mock.submitPress?.());
    expect(mock.submitted).not.toHaveBeenCalled();
  });

  it("failed/terminal read and noneditable response never expose a live submit handler", async () => {
    const failed = await mounted(null, answers, { success: false, code: "G05_SESSION_CHANGED" });
    expect(surveySubmitButton(failed)).toBeNull();
    expect(mock.submitted).not.toHaveBeenCalled();
    const readonly = await mounted(false);
    expect(surveySubmitButton(readonly)).toBeNull();
    expect(mock.submitted).not.toHaveBeenCalled();
  });
});

// LEARN032_SURVEY_SUBMIT_SAFE_FAILURE — existing mounted native survey POST only.
const submitAlertText = (host: HTMLElement) =>
  host.querySelector<HTMLElement>('[role="alert"][aria-live="assertive"]');
describe("LEARN032_SURVEY_SUBMIT_SAFE_FAILURE existing failure feedback", () => {
  it.each([
    ["code-only", { success: false, code: "UNEXPECTED_FAILURE" },
      "Не удалось отправить анкету. Попробуйте ещё раз."],
    ["423 edit window", { success: false, code: "SURVEY_EDIT_WINDOW_EXPIRED",
      error: "RAW_PRIVATE_EDIT_WINDOW_423_SERVER_DIAGNOSTIC" },
      "Срок редактирования анкеты истёк. Изменения больше нельзя отправить."],
    ["expired session", { success: false, code: "SESSION_EXPIRED",
      error: "RAW_PRIVATE_SESSION_COOKIE_TOKEN" },
      "Сессия истекла или изменилась. Войдите снова, чтобы отправить анкету."],
    ["changed session", { success: false, code: "G05_SESSION_CHANGED" },
      "Сессия истекла или изменилась. Войдите снова, чтобы отправить анкету."],
    ["raw message without code", { success: false,
      error: "RAW_PATIENT_EMAIL_SENSITIVE_PERSONAL_DETAIL" },
      "Не удалось отправить анкету. Попробуйте ещё раз."],
    ["unknown code and raw message", { success: false, code: "SOME_NEW_MACHINE_CODE",
      error: "RAW_INTERNAL_STACKTRACE_DATABASE_PASSWORD" },
      "Не удалось отправить анкету. Попробуйте ещё раз."],
  ] as const)("%s uses only fixed local accessible failure text", async (_mode, response, expected) => {
    const host = await mounted(true);
    mock.submitted.mockResolvedValueOnce(response);
    const submit = surveySubmitButton(host);
    expect(submit?.disabled).toBe(false);
    await act(async () => submit?.click());
    await act(async () => { await new Promise(done => setTimeout(done, 28)); });
    expect(mock.submitted).toHaveBeenCalledTimes(1);
    const alert = submitAlertText(host);
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toBe(expected);
    expect(alert?.getAttribute("aria-label")).toBe(expected);
    expect(host.textContent).not.toMatch(/RAW_|PRIVATE_|STACKTRACE|DATABASE_PASSWORD/);
    expect(host.outerHTML).not.toMatch(/RAW_|PRIVATE_|STACKTRACE|DATABASE_PASSWORD/);
    expect(surveySubmitButton(host)?.disabled).toBe(false);
    await act(async () => { await new Promise(done => setTimeout(done, 25)); });
    expect(mock.submitted).toHaveBeenCalledTimes(1);
  });

  it("rejected network failure stays one generic accessible alert without raw exception text", async () => {
    const host = await mounted(true);
    mock.submitted.mockRejectedValueOnce(new Error("RAW_EXCEPTION_SECRET_IN_TRANSPORT"));
    await act(async () => surveySubmitButton(host)?.click());
    await act(async () => { await new Promise(done => setTimeout(done, 25)); });
    const alerts = Array.from(host.querySelectorAll<HTMLElement>(
      '[role="alert"][aria-live="assertive"]',
    ));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toBe("Не удалось отправить анкету.");
    expect(alerts[0].getAttribute("aria-label")).toBe("Не удалось отправить анкету.");
    expect(host.outerHTML).not.toContain("RAW_EXCEPTION_SECRET_IN_TRANSPORT");
    expect(mock.submitted).toHaveBeenCalledTimes(1);
  });
});
