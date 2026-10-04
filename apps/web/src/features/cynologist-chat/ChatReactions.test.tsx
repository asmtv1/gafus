// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), change: vi.fn() }));
vi.mock("@gafus/error-handling", () => ({ reportClientError: vi.fn() }));
vi.mock("stream-chat-react", () => ({
  useChatContext: () => ({ client }),
  useMessageContext: () => ({
    message: { id: "message", type: "regular", reaction_counts: counts },
    isMyMessage: () => false,
  }),
}));
import { ChatReactionContext, ChatReactionList } from "./ChatReactions";
const counts = { like: 1, love: 1 };
const client = { userID: "me", queryReactions: mocks.query };
let root: Root;
let host: HTMLDivElement;
function button(label: string) {
  return document.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.query.mockReset();
  mocks.change.mockReset();
  mocks.query.mockResolvedValue({
    reactions: [
      { user_id: "me", type: "like", user: { name: "Я" } },
      { user_id: "other", type: "love", user: { name: "Кинолог" } },
    ],
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
it("opens all participants, filters reactions and only removes the user's own reaction", async () => {
  await act(async () =>
    root.render(
      <ChatReactionContext.Provider value={{ enabled: true, pending: false, change: mocks.change }}>
        <ChatReactionList />
      </ChatReactionContext.Provider>,
    ),
  );
  await act(async () =>
    Array.from(host.querySelectorAll("button")).find((item) => item.textContent === "Кто поставил")!.click(),
  );
  expect(mocks.query).toHaveBeenLastCalledWith("message", {}, [{ created_at: -1 }], { limit: 30 });
  const filters = document.querySelector('[aria-label="Фильтр реакций"]')!;
  const love = filters.querySelectorAll("button")[2] as HTMLButtonElement;
  await act(async () => love.click());
  expect(mocks.query.mock.calls.at(-1)![1]).toEqual({ type: "love" });
  expect(button("Кинолог").disabled).toBe(true);
  await act(async () => button("Я. Убрать свою реакцию").click());
  expect(mocks.change).toHaveBeenCalledWith("message", "like", true);
  await act(async () => button("Закрыть").click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
