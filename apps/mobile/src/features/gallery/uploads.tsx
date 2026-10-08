import { useEffect, useState } from "react";
import { Alert, AppState, Linking, View } from "react-native";
import { Text } from "react-native-paper";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import { useQuery } from "@tanstack/react-query";
import { GALLERY_LIMITS } from "@gafus/types";
import { Button } from "@/shared/components/ui";
import { galleryApi } from "@/shared/lib/api/gallery";
import { galleryError, galleryKeys, requestId, useForeground, useGalleryContext } from "./data";
import { taskAt, updateTask, useGallerySession, type UploadTask } from "./session";
import { styles as s } from "./styles";
import { cancelTask, pollTask, runUpload } from "./queue";

let sending = 0;
const waiting: (() => void)[] = [];
async function slot() {
  if (sending >= 3) await new Promise<void>(resolve => waiting.push(resolve));
  else sending++;
  return () => { const next = waiting.shift(); if (next) next(); else sending--; };
}
function detectedMime(file: File): "image/jpeg" | "image/png" | "image/webp" | null {
  const handle = file.open();
  try {
    const b = handle.readBytes(12);
    if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
    if (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) return "image/png";
    if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
    return null;
  } finally { handle.close(); }
}
async function prepare(asset: ImagePicker.ImagePickerAsset) {
  let file = new File(asset.uri);
  let mime = detectedMime(file);
  let temporary = false;
  if (!mime) {
    if (!/hei[cf]/i.test(`${asset.mimeType ?? ""} ${asset.fileName ?? ""}`)) {
      throw new Error("Выберите JPG, PNG, WebP или HEIC. Другие форматы не поддерживаются.");
    }
    const longest = Math.max(asset.width, asset.height);
    const image = await manipulateAsync(asset.uri, longest > 4096
      ? [{ resize: asset.width >= asset.height ? { width: 4096 } : { height: 4096 } }] : [],
    { format: SaveFormat.JPEG, compress: 0.9 });
    file = new File(image.uri);
    mime = detectedMime(file);
    temporary = true;
  }
  if (!mime || file.size <= 0 || file.size > GALLERY_LIMITS.photoBytes) {
    if (temporary) file.delete();
    throw new Error("Файл должен быть JPG, PNG или WebP размером до 10 МиБ. Выберите другой файл.");
  }
  if (!temporary && asset.width * asset.height > GALLERY_LIMITS.pixels) throw new Error("Фото должно быть не больше 50 мегапикселей.");
  const extension = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
  return { file, mime, temporary, filename: `photo-${requestId()}.${extension}` };
}
async function send(asset: ImagePicker.ImagePickerAsset, task: UploadTask, epoch: number) {
  await runUpload(task.id, { epoch, generation: task.generation }, galleryApi, {
    acquire: slot, active: () => AppState.currentState === "active", requestId, errorText: galleryError,
    prepare: async () => {
      const prepared = await prepare(asset);
      return {
        input: { filename: prepared.filename, declaredMime: prepared.mime, declaredBytes: prepared.file.size },
        dispose: () => { if (prepared.temporary) prepared.file.delete(); },
        transfer: async (upload, controller) => {
          if (upload.postFields?.["Content-Type"] && upload.postFields["Content-Type"] !== prepared.mime) throw new Error("Для повтора выберите фотографию того же формата, что и исходный файл.");
          if (!upload.postUrl || !upload.postFields) throw new Error("Ссылка загрузки недоступна. Выберите файл заново.");
          const body = new FormData();
          for (const [key, value] of Object.entries(upload.postFields)) body.append(key, value);
          body.append("file", { uri: prepared.file.uri, name: prepared.filename, type: prepared.mime } as unknown as Blob);
          const background = AppState.addEventListener("change", state => { if (state !== "active") controller.abort(); });
          try {
            const response = await fetch(upload.postUrl, { method: "POST", body, signal: controller.signal });
            if (!response.ok) throw new Error("Хранилище не приняло файл. Проверьте интернет и выберите файл заново.");
          } finally { background.remove(); }
        },
      };
    },
  });
}
const statusLabel: Record<UploadTask["status"], string> = {
  queued: "Ожидает загрузки", sending: "Загружается…", processing: "Обрабатывается…",
  ready: "Фото добавлено", failed: "Не удалось загрузить", expired: "Время загрузки истекло",
  cancelling: "Проверяется отмена…", cancelled: "Загрузка отменена",
};
function UploadRow({ task, retry }: { task: UploadTask; retry: (id?: string) => void }) {
  const { viewer, cache } = useGalleryContext();
  const foreground = useForeground();
  const epoch = useGallerySession(state => state.epoch);
  const status = useQuery({
    queryKey: [...galleryKeys.album(viewer, task.owner, task.albumId ?? "default"), "upload", task.upload?.uploadId, epoch, task.generation],
    queryFn: () => pollTask(task.id, { epoch, generation: task.generation }, galleryApi),
    enabled: !!viewer && !!task.upload && task.status === "processing" && foreground,
    refetchInterval: query => foreground && (!query.state.data || ["reserved", "uploaded", "processing"].includes(query.state.data.status)) ? 3000 : false,
    retry: 1, gcTime: 0,
  });
  useEffect(() => {
    if (status.data && taskAt(task.id, { epoch, generation: task.generation })) {
      void cache.invalidateQueries({ queryKey: galleryKeys.owner(viewer, task.owner) });
    }
  }, [status.data, task.id, task.generation, epoch, cache, viewer, task.owner]);
  const cancel = async () => {
    await cancelTask(task.id, epoch, galleryApi, galleryError);
    if (useGallerySession.getState().epoch === epoch) {
      void cache.invalidateQueries({ queryKey: galleryKeys.owner(viewer, task.owner) });
    }
  };
  return <View style={s.card}>
    <Text style={s.text}>{task.filename} · {statusLabel[task.status]}</Text>
    {task.error ? <Text selectable accessibilityRole="alert" style={s.error}>{task.error}</Text> : null}
    {status.isError ? <Button label="Проверить статус" variant="outline" onPress={() => void status.refetch()} /> : null}
    {["failed", "expired"].includes(task.status) ? <Button label="Выбрать файл заново" variant="outline" onPress={() => retry(task.upload?.uploadId ?? task.retrySourceId)} /> : null}
    {!["ready", "cancelled"].includes(task.status) ? <Button label={task.status === "cancelling" ? "Проверить отмену снова" : "Отменить загрузку"} variant="outline" onPress={() => void cancel()} /> : null}
  </View>;
}
export function UploadControls({ owner, albumId, usedSlots = 0, retryUploadId, onRetried, compact = false }: {
  owner: string; albumId?: string; usedSlots?: number; retryUploadId?: string; onRetried?: () => void; compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { viewer, cache } = useGalleryContext();
  const tasks = useGallerySession(state => state.tasks);
  const pick = async (retryId?: string) => {
    const epoch = useGallerySession.getState().epoch;
    setBusy(true); setError("");
    let retryTask = retryId ? useGallerySession.getState().tasks.find(t => t.owner === owner
      && (t.upload?.uploadId === retryId || t.retrySourceId === retryId || t.retryOperation?.parentId === retryId)) : undefined;
    if (retryId && !retryTask) {
      retryTask = { id: requestId(), owner, albumId, filename: "Фотография", status: "failed", generation: 0, retrySourceId: retryId };
      const added = retryTask;
      useGallerySession.setState(state => ({ tasks: [...state.tasks, added] }));
    }
    if (retryTask?.cancelRequested || retryTask?.status === "cancelled") { setBusy(false); return; }
    const pickFence = retryTask ? { epoch, generation: retryTask.generation + 1 } : undefined;
    if (retryTask && pickFence) {
      updateTask(retryTask.id, { generation: pickFence.generation }, { epoch, generation: retryTask.generation });
      retryTask = { ...retryTask, generation: pickFence.generation };
    }
    const valid = () => useGallerySession.getState().epoch === epoch && (!retryTask || !!taskAt(retryTask.id, pickFence!));
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!valid()) return;
      if (!permission.granted) {
        Alert.alert("Доступ к фотографиям", "Разрешите доступ к фото в настройках телефона.",
          [{ text: "Отмена", style: "cancel" }, { text: "Настройки", onPress: () => void Linking.openSettings() }]);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"],
        allowsMultipleSelection: !retryId, selectionLimit: retryId ? 1 : Math.max(1, 200 - usedSlots), quality: 1 });
      if (result.canceled || !result.assets.length || !valid()) return;
      const selected = result.assets.map(asset => ({ asset, task: retryTask ? {
        ...retryTask, filename: asset.fileName ?? "Фотография", status: "queued" as const,
      } : {
        id: requestId(), owner, albumId, filename: asset.fileName ?? "Фотография", status: "queued" as const, generation: 0,
      } }));
      if (retryTask && pickFence) updateTask(retryTask.id, selected[0].task, pickFence);
      else useGallerySession.setState(state => ({ tasks: [...state.tasks, ...selected.map(item => item.task)] }));
      await Promise.all(selected.map(({ asset, task }) => send(asset, task, epoch)));
      if (valid()) {
        await cache.invalidateQueries({ queryKey: galleryKeys.owner(viewer, owner) });
        if (valid()) onRetried?.();
      }
    } catch (e) { if (valid()) setError(galleryError(e)); }
    finally { setBusy(false); }
  };
  return <View style={s.section}>
    <Button label={retryUploadId ? "Выбрать файл заново" : "Добавить фотографии"} loading={busy}
      disabled={busy || (!retryUploadId && usedSlots >= 200)} onPress={() => void pick(retryUploadId)} />
    {!compact ? <Text style={s.muted}>JPG, PNG, WebP до 10 МиБ. HEIC преобразуется в JPG. Не закрывайте приложение до завершения загрузки.</Text> : null}
    {error ? <Text selectable accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {!compact && tasks.filter(t => t.owner === owner && (!albumId || t.albumId === albumId)).map(task =>
      <UploadRow key={task.id} task={task} retry={id => void pick(id)} />)}
  </View>;
}
