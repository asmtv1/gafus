// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Alert } from "react-native";
import { reportClientError } from "@/shared/lib/tracer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { getPoll, votePoll, changePollVote, cancelPollVote } = vi.hoisted(() => ({
  getPoll: vi.fn(), votePoll: vi.fn(), changePollVote: vi.fn(), cancelPollVote: vi.fn(),
}));
vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles },
  View: ({ children, style, accessible, accessibilityRole, accessibilityLabel }: {
    children: React.ReactNode;
    style?: { position?: string; width?: string; minHeight?: number } |
      { position?: string; width?: string; minHeight?: number }[];
    accessible?: boolean;
    accessibilityRole?: string;
    accessibilityLabel?: string;
  }) => {
    const styles = Array.isArray(style) ? style : [style];
    const fill = styles.some(item => item?.position === "absolute");
    const width = styles.find(item => item?.width)?.width;
    return <div role={accessibilityRole === "none" ? undefined : accessibilityRole}
      aria-label={accessibilityLabel} data-accessible={accessible ? "true" : undefined}
      data-min-height={styles.find(item => item?.minHeight)?.minHeight}
      data-result-fill={fill ? "true" : undefined}
      data-fill-width={fill ? width : undefined}>{children}</div>;
  },
  Text: ({ children, accessible, accessibilityLabel, accessibilityRole,
    accessibilityLiveRegion }: {
    children: React.ReactNode;
    accessible?: boolean;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    accessibilityLiveRegion?: "polite" | "assertive" | "none";
  }) => <span aria-hidden={accessible === false ? true : undefined}
    aria-label={accessibilityLabel}
    role={accessibilityRole === "header" ? "heading" : accessibilityRole}
    aria-live={accessibilityLiveRegion === "none" ? undefined : accessibilityLiveRegion}>
    {children}</span>,
  Pressable: ({ children, onPress, disabled, style, accessibilityLabel, accessibilityRole,
    accessibilityState }: {
    children: React.ReactNode;
    onPress: () => void;
    disabled?: boolean;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    accessibilityState?: { selected?: boolean; checked?: boolean; disabled?: boolean };
    style?: { minHeight?: number } | { minHeight?: number }[];
  }) => {
    const styles = Array.isArray(style) ? style : [style];
    return (
      <button role={accessibilityRole} onClick={onPress} disabled={disabled}
        aria-label={accessibilityLabel} aria-selected={accessibilityState?.selected}
        aria-checked={accessibilityState?.checked}
        aria-disabled={accessibilityState?.disabled}
        data-min-height={styles.find(item => item?.minHeight)?.minHeight}
      >{children}</button>
    );
  },
  Alert: { alert: vi.fn() },
}));
vi.mock("@/shared/config", () => ({ COLORS: {}, FONTS: {} }));
vi.mock("@/shared/components", () => ({
  Button: ({ label, onPress, disabled }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => <button onClick={onPress} disabled={disabled}>{label}</button>,
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("@/shared/components/media/CdnImage", () => ({
  CdnImage: ({ style }: { style: { width: number; height: number } }) => (
    <div data-thumbnail-width={style.width} data-thumbnail-height={style.height} />
  ),
}));
vi.mock("@/shared/lib/api/feed", () => ({
  feedApi: { getPoll, votePoll, changePollVote, cancelPollVote },
}));
import { FeedPollCard } from "./FeedPollCard";
let host: HTMLDivElement, root: Root, cache: QueryClient;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  getPoll.mockReset(); votePoll.mockReset(); changePollVote.mockReset(); cancelPollVote.mockReset();
  vi.mocked(Alert.alert).mockClear();
  vi.mocked(reportClientError).mockClear();
  getPoll.mockResolvedValue({
    id: "poll", postId: "post", question: "Любите собак?", closed: false,
    allowMultiple: false, isQuiz: false, isAnonymous: true, shuffleOptions: false,
    totalVotes: null, myOptionIds: [], options: [
      { id: "a", text: "Да", votes: null, imageUrl: null },
      { id: "b", text: "Нет", votes: null, imageUrl: null },
    ],
  });
  votePoll.mockResolvedValue({});
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); cache.clear(); host.remove(); });
describe("Mobile FeedPollCard", () => {
  it("renders one compact 48dp row per answer with results filling the row, not a separate track", async () => {
    getPoll.mockResolvedValue({
      id: "poll", question: "Что думаете?", closed: false,
      allowMultiple: false, isQuiz: false, isAnonymous: false,
      totalVotes: 1, myOptionIds: ["a"],
      options: [
        { id: "a", text: "норм стало", votes: 1, imageUrl: null },
        { id: "b", text: "плохо стало", votes: 0, imageUrl: null },
        { id: "c", text: "мне пофигу", votes: 0, imageUrl: null },
      ],
    });
    await act(async () => root.render(
      <QueryClientProvider client={cache}><FeedPollCard postId="post" /></QueryClientProvider>
    ));
    await act(async () => {
      await vi.waitFor(() => expect(host.textContent).toContain("норм стало"));
    });
    const choices = Array.from(host.querySelectorAll<HTMLElement>("[data-min-height=\"48\"]"));
    expect(choices).toHaveLength(3);
    expect(choices.map(button => button.getAttribute("data-min-height"))).toEqual(["48", "48", "48"]);
    expect(choices[0]?.getAttribute("aria-label")).toBe("норм стало, 100%, Ваш выбор");
    expect(choices[0]?.getAttribute("role")).toBe("text");
    const fills = Array.from(host.querySelectorAll('[data-result-fill="true"]'));
    expect(fills.map(fill => fill.getAttribute("data-fill-width"))).toEqual(["100%", "0%", "0%"]);
    expect(host.textContent).toContain("1 голос");
    expect(host.textContent).not.toContain("Проголосовать");
  });

  it("keeps selection and voting available before results are shown", async () => {
    await act(async () => root.render(
      <QueryClientProvider client={cache}><FeedPollCard postId="post" /></QueryClientProvider>
    ));
    await act(async () => {
      await vi.waitFor(() => expect(host.textContent).toContain("Любите собак?"));
    });
    expect(host.querySelectorAll('[data-result-fill="true"]')).toHaveLength(0);
    const yes = host.querySelector('button[aria-label="Да"]') as HTMLButtonElement;
    const no = host.querySelector('button[aria-label="Нет"]') as HTMLButtonElement;
    expect(yes.disabled).toBe(false);
    expect(no.disabled).toBe(false);
    await act(async () => no.click());
    const submit = Array.from(host.querySelectorAll("button")).find(
      button => button.textContent === "Проголосовать"
    );
    await act(async () => submit?.click());
    await vi.waitFor(() => expect(votePoll).toHaveBeenCalledWith("post", { optionIds: ["b"] }));
  });

  it("preserves multiple-choice voting when answers are compact", async () => {
    getPoll.mockResolvedValue({
      id: "poll", question: "Что выбрать?", closed: false,
      allowMultiple: true, isQuiz: false, isAnonymous: true,
      totalVotes: null, myOptionIds: [],
      options: [
        { id: "a", text: "Первый", votes: null, imageUrl: null },
        { id: "b", text: "Второй", votes: null, imageUrl: null },
      ],
    });
    await act(async () => root.render(
      <QueryClientProvider client={cache}><FeedPollCard postId="post" /></QueryClientProvider>
    ));
    await act(async () => {
      await vi.waitFor(() => expect(host.textContent).toContain("Что выбрать?"));
    });
    const first = host.querySelector('button[aria-label="Первый"]') as HTMLButtonElement;
    const second = host.querySelector('button[aria-label="Второй"]') as HTMLButtonElement;
    await act(async () => {
      first.click();
      second.click();
    });
    const submit = Array.from(host.querySelectorAll("button")).find(
      button => button.textContent === "Проголосовать"
    );
    await act(async () => submit?.click());
    await vi.waitFor(() => expect(votePoll).toHaveBeenCalledWith("post", {
      optionIds: ["a", "b"],
    }));
  });

  it("keeps optional images as small thumbnails inside the answer row", async () => {
    getPoll.mockResolvedValue({
      id: "poll", question: "Какой вариант?", closed: false,
      allowMultiple: false, isQuiz: false, isAnonymous: false,
      totalVotes: null, myOptionIds: [],
      options: [{ id: "a", text: "Вариант с фото", votes: null,
        imageUrl: "https://example.test/photo.jpg", imageMediaId: "media-1" }],
    });
    await act(async () => root.render(
      <QueryClientProvider client={cache}><FeedPollCard postId="post" /></QueryClientProvider>
    ));
    await act(async () => {
      await vi.waitFor(() => expect(host.textContent).toContain("Вариант с фото"));
    });
    const thumbnail = host.querySelector("[data-thumbnail-width]");
    expect(thumbnail?.getAttribute("data-thumbnail-width")).toBe("44");
    expect(thumbnail?.getAttribute("data-thumbnail-height")).toBe("44");
  });
  it("selects exactly one answer and submits it with authenticated feed transport", async () => {
    await act(async () => root.render(<QueryClientProvider client={cache}><FeedPollCard postId="post" /></QueryClientProvider>));
    await act(async () => { await vi.waitFor(() => expect(host.textContent).toContain("Любите собак?")); });
    const option = Array.from(host.querySelectorAll("button")).find(button => button.textContent?.includes("Да"));
    expect(option).toBeTruthy();
    await act(async () => option?.click());
    const submit = Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Проголосовать");
    await act(async () => submit?.click());
    await vi.waitFor(() => expect(votePoll).toHaveBeenCalledWith("post", { optionIds: ["a"] }));
  });
});


// SOC041_MOBILE_POLL_VOTE_FLIGHT: existing native-press mounted fixture, no image/media cases.
describe("SOC041_MOBILE_POLL_VOTE_FLIGHT existing ordinary vote", () => {
  it("two native presses in one React turn produce exactly one vote POST", async () => {
    let complete!: (value: unknown) => void;
    votePoll.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    await act(async () => root.render(
      <QueryClientProvider client={cache}><FeedPollCard postId="post" /></QueryClientProvider>
    ));
    await act(async () => { await vi.waitFor(() => expect(host.textContent).toContain("Любите собак?")); });
    await act(async () => (host.querySelector('button[aria-label="Да"]') as HTMLButtonElement).click());
    const button = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      .find(item => item.textContent === "Проголосовать")!;
    await act(async () => { button.click(); button.click(); await Promise.resolve(); });
    expect(votePoll).toHaveBeenCalledTimes(1);
    expect(votePoll).toHaveBeenCalledWith("post", { optionIds: ["a"] });
    await act(async () => complete({}));
    await act(async () => { await new Promise(done => setTimeout(done, 15)); });
    expect(votePoll).toHaveBeenCalledTimes(1);
  });

  it.each(["closed", "already-voted", "not-selected"])(
    "%s poll never dispatches write without current server permission and selection", async scenario => {
      if (scenario !== "not-selected") getPoll.mockResolvedValue({
        id: "poll", postId: "post", question: "Запрещённый опрос", isQuiz: false,
        closed: scenario === "closed", isAnonymous: true, allowMultiple: false,
        totalVotes: null, myOptionIds: scenario === "already-voted" ? ["a"] : [],
        options: [{ id: "a", text: "Да", votes: null, imageUrl: null }],
      });
      await act(async () => root.render(
        <QueryClientProvider client={cache}><FeedPollCard postId="post" /></QueryClientProvider>
      ));
      await act(async () => { await vi.waitFor(() => expect(host.textContent)
        .toContain(scenario === "not-selected" ? "Любите собак?" : "Запрещённый опрос")); });
      const action = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
        .find(item => item.textContent === "Проголосовать");
      if (scenario === "not-selected") {
        expect(action?.disabled).toBe(true);
        await act(async () => action?.click());
      } else {
        expect(action).toBeUndefined();
        expect(host.querySelector('[aria-label^="Да"]')?.getAttribute("role"))
          .toBe("text");
      }
      expect(votePoll).not.toHaveBeenCalled();
    },
  );

  it("confirmed vote plus rejected cache invalidation unlocks busy and prevents replay", async () => {
    const fail = vi.spyOn(cache, "invalidateQueries")
      .mockRejectedValueOnce(new Error("PRIVATE_REFRESH_ERROR"));
    await act(async () => root.render(
      <QueryClientProvider client={cache}><FeedPollCard postId="post" /></QueryClientProvider>
    ));
    await act(async () => { await vi.waitFor(() => expect(host.textContent).toContain("Любите собак?")); });
    await act(async () => (host.querySelector('button[aria-label="Да"]') as HTMLButtonElement).click());
    await act(async () => Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      .find(button => button.textContent === "Проголосовать")?.click());
    await act(async () => { await new Promise(done => setTimeout(done, 20)); });
    expect(votePoll).toHaveBeenCalledTimes(1);
    expect(fail).toHaveBeenCalledWith({ queryKey: ["feed", "poll", "post"] });
    expect(vi.mocked(reportClientError)).toHaveBeenCalled();
    expect(vi.mocked(Alert.alert)).toHaveBeenCalledWith("Опрос",
      "Голос принят. Не удалось обновить результаты опроса.");
    expect(JSON.stringify(vi.mocked(Alert.alert).mock.calls)).not.toContain("PRIVATE_REFRESH_ERROR");
    expect(host.querySelector('button[aria-label="Да"]')?.hasAttribute("disabled"))
      .toBe(true);
    expect(host.textContent).not.toContain("Отправляем…");
    await act(async () => (host.querySelector('button[aria-label="Да"]') as HTMLButtonElement).click());
    expect(votePoll).toHaveBeenCalledTimes(1);
  });

  it("failed vote releases synchronous flight, keeps selection and retries only on next press", async () => {
    votePoll.mockRejectedValueOnce(new Error("WRITE_FAILED"));
    await act(async () => root.render(
      <QueryClientProvider client={cache}><FeedPollCard postId="post" /></QueryClientProvider>
    ));
    await act(async () => { await vi.waitFor(() => expect(host.textContent).toContain("Любите собак?")); });
    await act(async () => (host.querySelector('button[aria-label="Да"]') as HTMLButtonElement).click());
    await act(async () => Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      .find(button => button.textContent === "Проголосовать")?.click());
    await act(async () => { await new Promise(done => setTimeout(done, 15)); });
    expect(votePoll).toHaveBeenCalledTimes(1);
    expect(host.querySelector('button[aria-label="Да"]')?.hasAttribute("disabled"))
      .toBe(false);
    expect(JSON.stringify(vi.mocked(Alert.alert).mock.calls)).not.toContain("WRITE_FAILED");
    expect(host.textContent).not.toContain("Отправляем…");
    await act(async () => Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      .find(button => button.textContent === "Проголосовать")?.click());
    await act(async () => { await new Promise(done => setTimeout(done, 15)); });
    expect(votePoll).toHaveBeenCalledTimes(2);
  });
});


// SOC041_MOBILE_ORDINARY_CHANGE_CANCEL: original ordinary poll edit/cancel parity.
const voted = (ids: string[] = ["a"], attrs: Record<string, unknown> = {}) => ({
  id: "poll", postId: "post", question: "Обычный опрос",
  isQuiz: false, closed: false, isAnonymous: true, allowMultiple: false,
  totalVotes: ids.length ? 1 : null, myOptionIds: ids,
  options: [
    { id: "a", text: "Да", votes: ids.length ? Number(ids.includes("a")) : null, imageUrl: null },
    { id: "b", text: "Нет", votes: ids.length ? Number(ids.includes("b")) : null, imageUrl: null },
  ], ...attrs,
});
async function drawPoll(postId = "post") {
  await act(async () => root.render(
    <QueryClientProvider client={cache}><FeedPollCard postId={postId} /></QueryClientProvider>,
  ));
  await act(async () => { await vi.waitFor(() => expect(host.textContent).toContain("Обычный опрос")); });
}
function pollButton(label: string) {
  const found = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    .find(button => button.textContent?.trim() === label);
  if (!found) throw Error("Missing poll control: " + label);
  return found;
}
function pollOption(label: string) {
  const found = Array.from(host.querySelectorAll<HTMLElement>("[aria-label]"))
    .find(node => node.getAttribute("aria-label")?.startsWith(label));
  if (!found) throw Error("Missing poll option: " + label);
  return found;
}
function ownOrChecked(label: string) {
  const node = pollOption(label);
  return node.getAttribute("aria-checked") === "true" ||
    (node.getAttribute("role") === "text" &&
      node.getAttribute("aria-label")?.includes("Ваш выбор"));
}

describe("SOC041_MOBILE_ORDINARY_CHANGE_CANCEL native editable ordinary vote", () => {
  it("edit existing single choice, cancel draft without write, then one PUT and strict fresh GET", async () => {
    let server = voted();
    let resolveWrite!: (result: unknown) => void;
    changePollVote.mockImplementation(() => new Promise(resolve => { resolveWrite = resolve; }));
    getPoll.mockImplementation(() => Promise.resolve(server));
    await drawPoll();
    expect(host.textContent).toContain("Изменить ответ");
    expect(host.textContent).toContain("Отменить голос");
    await act(async () => pollButton("Изменить ответ").click());
    expect(ownOrChecked("Да, 100%")).toBe(true);
    await act(async () => pollOption("Нет, 0%").click());
    await act(async () => pollButton("Отменить изменения").click());
    expect(changePollVote).not.toHaveBeenCalled();
    expect(cancelPollVote).not.toHaveBeenCalled();
    await act(async () => pollButton("Изменить ответ").click());
    await act(async () => pollOption("Нет, 0%").click());
    const save = pollButton("Сохранить изменения");
    await act(async () => { save.click(); save.click(); await Promise.resolve(); });
    expect(changePollVote).toHaveBeenCalledTimes(1);
    expect(changePollVote).toHaveBeenCalledWith("post", { optionIds: ["b"] });
    expect(ownOrChecked("Да, 100%")).toBe(true);
    await act(async () => { server = voted(["b"]); resolveWrite(server); });
    await act(async () => { await new Promise(done => setTimeout(done, 30)); });
    expect(ownOrChecked("Нет, 100%")).toBe(true);
    expect(getPoll).toHaveBeenCalledTimes(2);
  });

  it("multiple choice retains confirmed IDs and changes via existing PUT without POST", async () => {
    let server = voted(["a"], { allowMultiple: true });
    getPoll.mockImplementation(() => Promise.resolve(server));
    changePollVote.mockImplementation((_id: string, input: { optionIds: string[] }) => {
      server = voted(input.optionIds, { allowMultiple: true });
      return Promise.resolve(server);
    });
    await drawPoll();
    await act(async () => pollButton("Изменить ответ").click());
    await act(async () => pollOption("Нет, 0%").click());
    await act(async () => pollButton("Сохранить изменения").click());
    await act(async () => { await new Promise(done => setTimeout(done, 25)); });
    expect(changePollVote).toHaveBeenCalledWith("post", { optionIds: ["a", "b"] });
    expect(votePoll).not.toHaveBeenCalled();
    expect(ownOrChecked("Да, 100%")).toBe(true);
  });

  it("double cancel vote sends one DELETE, no optimistic erase and fresh read shows no vote", async () => {
    let server = voted();
    let resolve!: (value: unknown) => void;
    cancelPollVote.mockImplementation(() => new Promise(done => { resolve = done; }));
    getPoll.mockImplementation(() => Promise.resolve(server));
    await drawPoll();
    const cancel = pollButton("Отменить голос");
    await act(async () => { cancel.click(); cancel.click(); await Promise.resolve(); });
    expect(cancelPollVote).toHaveBeenCalledTimes(1);
    expect(cancelPollVote).toHaveBeenCalledWith("post");
    expect(ownOrChecked("Да, 100%")).toBe(true);
    await act(async () => { server = voted([]); resolve(server); });
    await act(async () => { await new Promise(done => setTimeout(done, 25)); });
    expect(host.textContent).toContain("Проголосовать");
    expect(host.textContent).toContain("Результаты скрыты");
    expect(host.textContent).not.toContain("Отменить голос");
  });

  it.each(["quiz", "closed"])("%s voted poll has zero mutable controls and writes", async scenario => {
    getPoll.mockResolvedValue(voted(["a"], {
      isQuiz: scenario === "quiz", closed: scenario === "closed",
    }));
    await drawPoll();
    expect(host.textContent).not.toContain("Изменить ответ");
    expect(host.textContent).not.toContain("Отменить голос");
    expect(pollOption("Да, 100%").getAttribute("role")).toBe(
      "text");
    expect(changePollVote).not.toHaveBeenCalled();
    expect(cancelPollVote).not.toHaveBeenCalled();
  });

  it("unknown PUT requires explicit manual GET before further write, no automatic retry", async () => {
    let server = voted();
    getPoll.mockImplementation(() => Promise.resolve(server));
    changePollVote.mockRejectedValueOnce(new Error("PRIVATE_WRITE_MESSAGE"));
    await drawPoll();
    await act(async () => pollButton("Изменить ответ").click());
    await act(async () => pollOption("Нет, 0%").click());
    await act(async () => pollButton("Сохранить изменения").click());
    await act(async () => { await new Promise(done => setTimeout(done, 20)); });
    expect(changePollVote).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Проверить состояние голоса");
    expect(pollButton("Сохранить изменения").disabled).toBe(true);
    expect(ownOrChecked("Да, 100%")).toBe(true);
    await act(async () => pollButton("Сохранить изменения").click());
    expect(changePollVote).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(Alert.alert).mock.calls)).not.toContain("PRIVATE_WRITE_MESSAGE");
    await act(async () => pollButton("Проверить состояние голоса").click());
    await act(async () => { await new Promise(done => setTimeout(done, 25)); });
    expect(host.textContent).toContain("Изменить ответ");
    server = voted(["b"]);
    await act(async () => pollButton("Изменить ответ").click());
    await act(async () => pollOption("Нет, 0%").click());
    await act(async () => pollButton("Сохранить изменения").click());
    expect(changePollVote).toHaveBeenCalledTimes(2);
  });

  it("confirmed PUT plus rejected strict fresh GET never updates UI optimistically", async () => {
    let failRead = false;
    getPoll.mockImplementation(() => failRead ? Promise.reject(new Error("PRIVATE_GET_FAILURE"))
      : Promise.resolve(voted()));
    changePollVote.mockImplementation(() => { failRead = true; return Promise.resolve(voted(["b"])); });
    await drawPoll();
    await act(async () => pollButton("Изменить ответ").click());
    await act(async () => pollOption("Нет, 0%").click());
    await act(async () => pollButton("Сохранить изменения").click());
    await act(async () => { await new Promise(done => setTimeout(done, 30)); });
    expect(changePollVote).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Проверить состояние голоса");
    expect(ownOrChecked("Да, 100%")).toBe(true);
    expect(JSON.stringify(vi.mocked(Alert.alert).mock.calls)).not.toContain("PRIVATE_GET_FAILURE");
  });

  it("unknown DELETE result requires manual read and must not erase accepted choice", async () => {
    let server = voted();
    getPoll.mockImplementation(() => Promise.resolve(server));
    cancelPollVote.mockRejectedValueOnce(new Error("PRIVATE_CANCEL_PROVIDER_ERROR"));
    await drawPoll();
    await act(async () => pollButton("Отменить голос").click());
    await act(async () => { await new Promise(done => setTimeout(done, 20)); });
    expect(cancelPollVote).toHaveBeenCalledTimes(1);
    expect(ownOrChecked("Да, 100%")).toBe(true);
    expect(pollButton("Отменить голос").disabled).toBe(true);
    await act(async () => pollButton("Отменить голос").click());
    expect(cancelPollVote).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(Alert.alert).mock.calls))
      .not.toContain("PRIVATE_CANCEL_PROVIDER_ERROR");
    server = voted([]);
    await act(async () => pollButton("Проверить состояние голоса").click());
    await act(async () => { await new Promise(done => setTimeout(done, 25)); });
    expect(host.textContent).toContain("Проголосовать");
    expect(host.textContent).not.toContain("Отменить голос");
    expect(cancelPollVote).toHaveBeenCalledTimes(1);
  });

  it("post switch while old PUT pending cannot overwrite new post or hold its actions", async () => {
    let settle!: (value: unknown) => void;
    changePollVote.mockImplementation(() => new Promise(resolve => { settle = resolve; }));
    getPoll.mockImplementation((postId: string) => Promise.resolve({
      ...voted(), postId, question: "Обычный опрос",
    }));
    await drawPoll();
    await act(async () => pollButton("Изменить ответ").click());
    await act(async () => pollOption("Нет, 0%").click());
    await act(async () => pollButton("Сохранить изменения").click());
    expect(changePollVote).toHaveBeenCalledTimes(1);
    await drawPoll("post-2");
    expect(pollButton("Изменить ответ").disabled).toBe(false);
    expect(ownOrChecked("Да, 100%")).toBe(true);
    await act(async () => settle(voted(["b"])));
    await act(async () => { await new Promise(done => setTimeout(done, 25)); });
    expect(host.textContent).toContain("Изменить ответ");
    expect(ownOrChecked("Да, 100%")).toBe(true);
    expect(cache.getQueryData(["feed", "poll", "post-2"])).toMatchObject({
      myOptionIds: ["a"], postId: "post-2",
    });
  });

  it("invalid current option IDs block write until fresh server choice", async () => {
    getPoll.mockResolvedValue(voted(["removed"], { options: [
      { id: "a", text: "Да", votes: 1, imageUrl: null },
      { id: "b", text: "Нет", votes: 0, imageUrl: null },
    ] }));
    await drawPoll();
    expect(host.textContent).not.toContain("Изменить ответ");
    expect(host.textContent).not.toContain("Отменить голос");
    expect(changePollVote).not.toHaveBeenCalled();
  });
});


// SOC041_MOBILE_POLL_CHOICE_A11Y: the real RN semantics exposed by existing
// Pressable/View/Text mocks; ordinary TEXT options, no image/quiz mutations.
describe("SOC041_MOBILE_POLL_CHOICE_A11Y ordinary text poll", () => {
  it("single choice exposes named question/radiogroup and radio checked state", async () => {
    await act(async () => root.render(
      <QueryClientProvider client={cache}><FeedPollCard postId="post" /></QueryClientProvider>,
    ));
    await act(async () => { await vi.waitFor(() => expect(host.textContent).toContain("Любите собак?")); });
    expect(host.querySelector('[role="heading"]')?.textContent).toContain("Любите собак?");
    expect(host.querySelector('[role="radiogroup"]')?.getAttribute("aria-label"))
      .toContain("Любите собак?");
    const options = host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    expect(options).toHaveLength(2);
    expect(Array.from(options).map(node => node.getAttribute("aria-checked")))
      .toEqual(["false", "false"]);
    expect(Array.from(options).every(node => node.getAttribute("aria-disabled") === "false"))
      .toBe(true);
    expect(options[0]?.getAttribute("aria-label")).toBe("Да");
    await act(async () => options[0]?.click());
    expect(host.querySelector('[role="radio"][aria-label="Да"]')?.getAttribute("aria-checked"))
      .toBe("true");
    expect(host.querySelector('[role="radio"][aria-label="Нет"]')?.getAttribute("aria-checked"))
      .toBe("false");
    expect(votePoll).not.toHaveBeenCalled();
  });

  it("multiple choice uses checkboxes retaining independent checked values", async () => {
    getPoll.mockResolvedValue(voted([], { allowMultiple: true }));
    await drawPoll();
    expect(host.querySelector('[role="list"][aria-label*="Обычный опрос"]'))
      .not.toBeNull();
    const checkboxes = host.querySelectorAll<HTMLButtonElement>('[role="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    expect(Array.from(checkboxes).map(node => node.getAttribute("aria-checked")))
      .toEqual(["false", "false"]);
    await act(async () => checkboxes[0]?.click());
    await act(async () => checkboxes[1]?.click());
    expect(Array.from(host.querySelectorAll('[role="checkbox"]')).map(node =>
      node.getAttribute("aria-checked"))).toEqual(["true", "true"]);
    await act(async () => host.querySelector<HTMLButtonElement>('[role="checkbox"]')?.click());
    expect(Array.from(host.querySelectorAll('[role="checkbox"]')).map(node =>
      node.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    expect(votePoll).not.toHaveBeenCalled();
  });

  it.each(["confirmed", "closed-hidden"])(
    "%s ordinary result is static text with own-choice and no hidden vote percentage", async scenario => {
      getPoll.mockResolvedValue(scenario === "confirmed" ? voted(["a"]) : voted([], {
        closed: true, totalVotes: null,
      }));
      await drawPoll();
      expect(host.querySelectorAll('[role="radio"]')).toHaveLength(0);
      expect(host.querySelectorAll('[role="checkbox"]')).toHaveLength(0);
      expect(host.querySelector('[role="list"][aria-label*="Обычный опрос"]'))
        .not.toBeNull();
      expect(host.querySelectorAll('[role="text"][data-accessible="true"]')).toHaveLength(2);
      const labels = Array.from(host.querySelectorAll('[role="text"][data-accessible="true"]'))
        .map(node => node.getAttribute("aria-label"));
      if (scenario === "confirmed") {
        expect(labels).toEqual(["Да, 100%, Ваш выбор", "Нет, 0%"]);
        expect(host.textContent).toContain("1 голос");
      } else {
        expect(labels).toEqual(["Да", "Нет"]);
        expect(host.textContent).toContain("Результаты скрыты");
        expect(host.textContent).not.toContain("0%");
      }
      expect(votePoll).not.toHaveBeenCalled();
      expect(changePollVote).not.toHaveBeenCalled();
      expect(cancelPollVote).not.toHaveBeenCalled();
    },
  );

  it("editable voted choice becomes radio, cancellation restores read-only without PUT", async () => {
    getPoll.mockResolvedValue(voted(["a"]));
    await drawPoll();
    expect(host.querySelectorAll('[role="radio"]')).toHaveLength(0);
    await act(async () => pollButton("Изменить ответ").click());
    const radios = host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    expect(radios).toHaveLength(2);
    expect(Array.from(radios).map(node => node.getAttribute("aria-checked")))
      .toEqual(["true", "false"]);
    await act(async () => radios[1]?.click());
    expect(Array.from(host.querySelectorAll('[role="radio"]')).map(node =>
      node.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    await act(async () => pollButton("Отменить изменения").click());
    expect(host.querySelectorAll('[role="radio"]')).toHaveLength(0);
    expect(host.querySelector('[role="text"][aria-label="Да, 100%, Ваш выбор"]'))
      .not.toBeNull();
    expect(changePollVote).not.toHaveBeenCalled();
    expect(cancelPollVote).not.toHaveBeenCalled();
  });

  it("saving disables accessible input and unknown result exposes a live manual GET instruction", async () => {
    getPoll.mockResolvedValue(voted(["a"]));
    let reject!: (reason: Error) => void;
    changePollVote.mockImplementation(() => new Promise((_resolve, no) => { reject = no; }));
    await drawPoll();
    await act(async () => pollButton("Изменить ответ").click());
    await act(async () => host.querySelector<HTMLButtonElement>('[role="radio"][aria-label*="Нет"]')?.click());
    await act(async () => pollButton("Сохранить изменения").click());
    expect(Array.from(host.querySelectorAll('[role="radio"]')).every(node =>
      node.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(host.querySelector('[aria-live="polite"]')?.textContent)
      .toContain("Сохраняем голос");
    await act(async () => reject(new Error("NO_PRIVATE_PROVIDER_MESSAGE")));
    await act(async () => { await new Promise(done => setTimeout(done, 25)); });
    expect(host.querySelector('[aria-live="polite"]')?.textContent)
      .toContain("Проверьте состояние голоса");
    expect(pollButton("Проверить состояние голоса").disabled).toBe(false);
    expect(changePollVote).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(host.innerHTML)).not.toContain("NO_PRIVATE_PROVIDER_MESSAGE");
  });
});


// SOC041: Quiz answers are committed once. Screen readers need actual
// single/multiple selection before POST and static result text afterwards.
describe("SOC041_MOBILE_QUIZ_CHOICE_A11Y existing quiz vote and results", () => {
  it("single-choice quiz exposes radios and one submit via existing POST", async () => {
    getPoll.mockResolvedValue(voted([], { isQuiz: true }));
    await drawPoll();
    const group = host.querySelector('[role="radiogroup"]');
    expect(group?.getAttribute("aria-label")).toContain("Обычный опрос");
    const choices = host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    expect(choices).toHaveLength(2);
    expect(Array.from(choices).map(node => node.getAttribute("aria-checked")))
      .toEqual(["false", "false"]);
    await act(async () => choices[0]?.click());
    expect(host.querySelector('[role="radio"][aria-label="Да"]')?.getAttribute("aria-checked"))
      .toBe("true");
    expect(votePoll).not.toHaveBeenCalled();
    await act(async () => pollButton("Проголосовать").click());
    expect(votePoll).toHaveBeenCalledTimes(1);
    expect(votePoll).toHaveBeenCalledWith("post", { optionIds: ["a"] });
    expect(changePollVote).not.toHaveBeenCalled();
    expect(cancelPollVote).not.toHaveBeenCalled();
  });

  it("multiple-choice quiz exposes independently checked checkboxes", async () => {
    getPoll.mockResolvedValue(voted([], { isQuiz: true, allowMultiple: true }));
    await drawPoll();
    expect(host.querySelector('[role="list"][aria-label*="Можно выбрать несколько"]'))
      .not.toBeNull();
    const choices = host.querySelectorAll<HTMLButtonElement>('[role="checkbox"]');
    expect(choices).toHaveLength(2);
    await act(async () => choices[0]?.click());
    await act(async () => choices[1]?.click());
    expect(Array.from(host.querySelectorAll('[role="checkbox"]')).map(node =>
      node.getAttribute("aria-checked"))).toEqual(["true", "true"]);
    await act(async () => pollButton("Проголосовать").click());
    expect(votePoll).toHaveBeenCalledWith("post", { optionIds: ["a", "b"] });
    expect(changePollVote).not.toHaveBeenCalled();
    expect(cancelPollVote).not.toHaveBeenCalled();
  });

  it("quiz result announces server-provided correct option without unlocking another write", async () => {
    const original = voted(["a"], { isQuiz: true });
    getPoll.mockResolvedValue({ ...original, options: [
      { ...original.options[0], isCorrect: true },
      { ...original.options[1], isCorrect: false },
    ] });
    await drawPoll();
    expect(host.querySelector('[role="text"][aria-label="Да, 100%, Ваш выбор, Правильный ответ"]'))
      .not.toBeNull();
    expect(host.querySelector('[role="text"][aria-label="Нет, 0%"]')).not.toBeNull();
    expect(votePoll).not.toHaveBeenCalled();
    expect(changePollVote).not.toHaveBeenCalled();
    expect(cancelPollVote).not.toHaveBeenCalled();
  });

  it.each(["confirmed", "closed-hidden"])(
    "%s quiz shows static choice results, never misleading disabled buttons", async scenario => {
      getPoll.mockResolvedValue(scenario === "confirmed"
        ? voted(["a"], { isQuiz: true })
        : voted([], { isQuiz: true, closed: true, totalVotes: null }));
      await drawPoll();
      expect(host.querySelectorAll('[role="radio"], [role="checkbox"]')).toHaveLength(0);
      expect(host.querySelectorAll('[role="button"][aria-label]')).toHaveLength(0);
      expect(host.querySelectorAll('[role="text"][data-accessible="true"]')).toHaveLength(2);
      const names = Array.from(host.querySelectorAll('[role="text"][data-accessible="true"]'))
        .map(node => node.getAttribute("aria-label"));
      if (scenario === "confirmed") {
        expect(names).toEqual(["Да, 100%, Ваш выбор", "Нет, 0%"]);
      } else {
        expect(names).toEqual(["Да", "Нет"]);
        expect(host.textContent).toContain("Результаты скрыты");
      }
      expect(host.textContent).not.toContain("Изменить ответ");
      expect(host.textContent).not.toContain("Отменить голос");
      expect(votePoll).not.toHaveBeenCalled();
    },
  );
});
