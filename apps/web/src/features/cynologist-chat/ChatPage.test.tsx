// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  report: vi.fn(),
  channel: { keystroke: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("./api", () => ({ chatApi: mocks.api }));
vi.mock("@gafus/error-handling", () => ({ reportClientError: mocks.report }));
vi.mock("stream-chat-react", () => ({
  Streami18n: class {},
  useCreateChatClient: () => ({ channel: () => mocks.channel }),
  ComponentProvider: ({ children }: { children: React.ReactNode }) => children,
  Chat: ({ children }: { children: React.ReactNode }) => children,
  Channel: ({ children }: { children: React.ReactNode }) => children,
  Window: ({ children }: { children: React.ReactNode }) => children,
  MessageList: () => null,
}));
import { ConnectedChat } from "./ChatPage";
let root: Root;
let host: HTMLDivElement;
const session = {
  userId: "synthetic",
  apiKey: "synthetic",
  channelType: "messaging",
  channelId: "synthetic",
  token: "synthetic",
  expiresAt: "2030-01-01",
};
function mount(canSend = true) {
  return act(async () =>
    root.render(<ConnectedChat state={{ canSend }} session={session} refresh={async () => {}} />),
  );
}
function enter(text: string) {
  const field = host.querySelector("textarea")!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, text);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.api.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
it("sends once on two immediate clicks and preserves the ID on retry", async () => {
  let reject!: (error: Error) => void;
  mocks.api
    .mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    )
    .mockResolvedValueOnce({});
  await mount();
  await act(async () => enter("Сообщение"));
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Отправить"]')!;
  await act(async () => {
    button.click();
    button.click();
  });
  expect(mocks.api).toHaveBeenCalledTimes(1);
  const id = mocks.api.mock.calls[0][1].body.clientMessageId;
  await act(async () => reject(new Error("Сеть недоступна")));
  expect(host.querySelector("textarea")!.disabled).toBe(true);
  await act(async () => button.click());
  expect(mocks.api.mock.calls[1][1].body.clientMessageId).toBe(id);
  expect(host.querySelector("textarea")!.value).toBe("");
});
it("shows subscription recovery instead of a composer for expired access", async () => {
  await mount(false);
  expect(host.querySelector("textarea")).toBeNull();
  expect(host.querySelector("a")!.getAttribute("href")).toBe("/subscription");
});
it("rejects oversized images before making an upload request", async () => {
  await mount();
  const input = host.querySelector('input[type="file"]')!;
  const file = new File(["test"], "large.webp", { type: "image/webp" });
  Object.defineProperty(file, "size", { value: 11 * 1024 * 1024 });
  Object.defineProperty(input, "files", { value: [file] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(mocks.api).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')!.textContent).toContain("10 МБ");
});
it("allows removing an uploaded attachment from the draft", async () => {
  mocks.api.mockResolvedValue({ id: "attachment-one", name: "photo.webp" });
  await mount();
  const input = host.querySelector('input[type="file"]')!;
  Object.defineProperty(input, "files", {
    value: [new File(["test"], "photo.webp", { type: "image/webp" })],
  });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  const remove = host.querySelector('button[aria-label="Убрать photo.webp"]') as HTMLButtonElement;
  expect(remove).not.toBeNull();
  await act(async () => remove.click());
  expect(host.textContent).not.toContain("photo.webp");
});

it("Enter sends while Shift+Enter keeps a multiline draft", async () => {
  mocks.api.mockResolvedValue({});
  await mount();
  await act(async () => enter("Сообщение"));
  const field = host.querySelector("textarea")!;
  await act(async () =>
    field.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(mocks.api).not.toHaveBeenCalled();
  await act(async () =>
    field.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(mocks.api).toHaveBeenCalledTimes(1);
  expect(field.value).toBe("");
});
