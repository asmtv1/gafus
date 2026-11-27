// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Chat2RoomScreen from "./Chat2RoomScreen";

const mock = vi.hoisted(() => ({
  picker: vi.fn(), permission: vi.fn(), alert: vi.fn(), upload: vi.fn(), send: vi.fn(),
  photo: vi.fn(), webp: vi.fn(), video: vi.fn(), poster: vi.fn(), messages: vi.fn(),
  next: 0,
}));
// Telemetry is a network boundary; mounted tests use the native view with a local ACK.
vi.mock("@/shared/lib/api/client", () => ({ apiClient: vi.fn(async () => ({ success: true })) }));
vi.mock("react-native", () => {
  const box = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return {
    Platform: { OS: "android" }, View: box, ScrollView: box, Text: box,
    KeyboardAvoidingView: box, TextInput: () => null, ActivityIndicator: () => null,
    Image: () => null, Modal: () => null,
    AppState: { currentState: "active", addEventListener: () => ({ remove: vi.fn() }) },
    Alert: { alert: mock.alert }, StyleSheet: { create: (value: unknown) => value },
    Pressable: (props: { children?: ReactNode; accessibilityLabel?: string;
      disabled?: boolean; onPress?: () => void }) => createElement("button", {
      "aria-label": props.accessibilityLabel, disabled: props.disabled, onClick: props.onPress,
    }, props.children),
    FlatList: ({ data, renderItem }: { data: unknown[];
      renderItem: (value: { item: unknown; index: number }) => ReactNode }) => createElement(
      "div", null, data.map((item, index) => renderItem({ item, index })),
    ),
  };
});
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "room-1" }), useRouter: () => ({ back: vi.fn() }),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => `uuid-${++mock.next}` }));
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: mock.picker, requestMediaLibraryPermissionsAsync: mock.permission,
}));
vi.mock("expo-file-system", () => ({ File: class { size = 1024; } }));
vi.mock("expo-document-picker", () => ({}));
vi.mock("expo-video", () => ({}));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("react-native-gesture-handler", () => ({}));
vi.mock("@/shared/components/media/SwipeDismissMedia", () => ({}));
vi.mock("@/shared/components/media/VideoQualitySettings", () => ({}));
vi.mock("@/shared/components/media/SocialVideoControls", () => ({}));
vi.mock("@/shared/lib/media/videoPlaybackPolicy", () => ({}));
vi.mock("@/shared/lib/media/videoQualityTelemetry", () => ({}));
vi.mock("@/shared/components/gestures/SwipeDismissHandle", () => ({ SwipeDismissHandle: () => null }));
vi.mock("@/shared/components/TexturedSafeAreaView", () => ({
  TexturedSafeAreaView: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock("@/shared/lib/media/prepareUploadPhoto", () => ({ prepareUploadPhoto: mock.photo }));
vi.mock("@/shared/lib/media/prepareUploadWebp", () => ({ prepareUploadWebpVariants: mock.webp }));
vi.mock("@/shared/lib/media/prepareUploadVideo720", () => ({ prepareUploadVideo720: mock.video }));
vi.mock("@/shared/lib/media/prepareVideoPosterWebp", () => ({ prepareVideoPosterWebp: mock.poster }));
vi.mock("@/shared/lib/error-reporting", () => ({ reportClientError: vi.fn() }));
vi.mock("@/shared/stores", () => {
  const getState = () => ({ isAuthenticated: true, user: { id: "me" } });
  return { useAuthStore: Object.assign(
    (selector: (value: ReturnType<typeof getState>) => unknown) => selector(getState()), { getState },
  ) };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: { getVerifiedBinding: () => ({ principalId: "me", authEpoch: "test" }) },
}));
vi.mock("./Chat2Avatar", () => ({ Chat2Avatar: () => null, Chat2MessageAuthorAvatar: () => null }));
vi.mock("./Chat2SettingsSheet", () => ({ Chat2SettingsSheet: () => null }));
vi.mock("./Chat2ImageBrowse", () => ({}));
vi.mock("./Chat2ReportSheet", () => ({ Chat2ReportSheet: () => null }));
vi.mock("./SwipeReplyMessage", () => ({ SwipeReplyMessage: ({ children }: { children: ReactNode }) => children }));
vi.mock("./api", () => ({
  nameFor: () => "Тестовый чат",
  chat2: {
    room: async () => ({ id: "room-1", kind: "DIRECT", members: [] }),
    messages: mock.messages,
    connect: () => new Promise(() => undefined), read: () => Promise.resolve(),
    upload: mock.upload, send: mock.send,
  },
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mock.next = 0;
  mock.messages.mockResolvedValue([]);
  const dispose = vi.fn();
  mock.photo.mockResolvedValue({ dispose });
  mock.webp.mockResolvedValue({
    small: { uri: "file:///small.webp", bytes: 100, dispose },
    medium: { uri: "file:///medium.webp", bytes: 300, width: 100, height: 100, dispose },
  });
  mock.video.mockResolvedValue({ uri: "file:///video720.mp4", bytes: 500, mime: "video/mp4", dispose });
  mock.poster.mockResolvedValue({ uri: "file:///cover.webp", dispose });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function press(label: string) {
  const button = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  await act(async () => button?.click());
}

it.each(["Фото", "Видео MP4"])("prepares Android %s and preserves attachments on send retry", async kind => {
  const image = kind === "Фото";
  const fileName = image ? "test.jpg" : "test.mp4";
  mock.picker.mockResolvedValue({ canceled: false, assets: [{
    type: image ? "image" : "video", uri: `file:///cache/${fileName}`, fileName,
    width: 100, height: 100,
  }] });
  mock.upload.mockResolvedValue({ id: "attachment-1" });
  mock.send.mockRejectedValueOnce(new Error("Temporary failure")).mockResolvedValueOnce(undefined);
  await act(async () => root.render(<Chat2RoomScreen />));
  await press("Прикрепить фото, видео или PDF");
  const actions = mock.alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  await act(async () => actions.find(action => action.text === kind)?.onPress?.());
  expect(mock.permission).not.toHaveBeenCalled();
  expect(mock.picker).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    mediaTypes: [image ? "images" : "videos"], allowsMultipleSelection: image, legacy: false,
  }));
  expect(image ? mock.webp : mock.video).toHaveBeenCalledOnce();
  expect(mock.upload).not.toHaveBeenCalled();
  await press("Отправить сообщение");
  await press("Отправить сообщение");
  expect(mock.upload).toHaveBeenCalledOnce();
  expect(mock.send).toHaveBeenCalledTimes(2);
  expect(mock.send.mock.calls[0]).toEqual(mock.send.mock.calls[1]);
  expect(mock.send.mock.calls[1][4]).toEqual(["attachment-1"]);
  expect(mock.messages).toHaveBeenCalledTimes(2);
  expect(host.textContent).not.toContain(fileName);
});
