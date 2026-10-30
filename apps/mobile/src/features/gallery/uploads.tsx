import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, AppState, Linking, Pressable, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text } from "react-native-paper";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import { useQuery } from "@tanstack/react-query";
import { GALLERY_LIMITS } from "@gafus/types";
import { Button } from "@/shared/components/ui";
import { COLORS } from "@/shared/config";
import { galleryUploadForActor } from "./uploadScopedApi";
import { sameGalleryActor, type GalleryActor } from "./privateRead";
import { useAuthStore } from "@/shared/stores/authStore";
import { reportClientError } from "@/shared/lib/tracer";
import { galleryError, galleryKeys, requestId, useForeground, useGalleryContext } from "./data";
import {
  canDismissUploadTask,
  dismissUploadTask,
  taskAt,
  updateTask,
  useGallerySession,
  type UploadTask,
} from "./session";
import { styles as s } from "./styles";
import { cancelTask, pollTask, runUpload, unexpiredUpload } from "./queue";
import { galleryUploadRejected } from "./storage-error";
import { acquireGalleryUploadSlot } from "./uploadConcurrency";

function detectedMime(file: File): "image/jpeg" | "image/png" | "image/webp" | null {
  const handle = file.open();
  try {
    const b = handle.readBytes(12);
    if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
    if (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) return "image/png";
    if (
      String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...b.slice(8, 12)) === "WEBP"
    )
      return "image/webp";
    return null;
  } finally {
    handle.close();
  }
}
async function prepare(asset: ImagePicker.ImagePickerAsset, current: () => boolean) {
  if (!current()) throw new Error("GALLERY_UPLOAD_STALE_SESSION");
  let file = new File(asset.uri);
  let mime = detectedMime(file);
  let temporary = false;
  if (!mime) {
    if (!/hei[cf]/i.test(`${asset.mimeType ?? ""} ${asset.fileName ?? ""}`)) {
      throw new Error("Выберите JPG, PNG, WebP или HEIC. Другие форматы не поддерживаются.");
    }
    const longest = Math.max(asset.width, asset.height);
    const image = await manipulateAsync(
      asset.uri,
      longest > 4096
        ? [{ resize: asset.width >= asset.height ? { width: 4096 } : { height: 4096 } }]
        : [],
      { format: SaveFormat.JPEG, compress: 0.9 },
    );
    if (!current()) throw new Error("GALLERY_UPLOAD_STALE_SESSION");
    file = new File(image.uri);
    mime = detectedMime(file);
    temporary = true;
  }
  if (!current()) {
    if (temporary) file.delete();
    throw new Error("GALLERY_UPLOAD_STALE_SESSION");
  }
  if (!mime || file.size <= 0 || file.size > GALLERY_LIMITS.photoBytes) {
    if (temporary) file.delete();
    throw new Error("Файл должен быть JPG, PNG или WebP размером до 10 МиБ. Выберите другой файл.");
  }
  if (!temporary && asset.width * asset.height > GALLERY_LIMITS.pixels)
    throw new Error("Фото должно быть не больше 50 мегапикселей.");
  const extension = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
  return { file, mime, temporary, filename: `photo-${requestId()}.${extension}` };
}
async function send(
  asset: ImagePicker.ImagePickerAsset,
  task: UploadTask,
  epoch: number,
  actor: GalleryActor,
  current: () => boolean,
) {
  const api = galleryUploadForActor(actor, current);
  await runUpload(task.id, { epoch, generation: task.generation }, api, {
    acquire: acquireGalleryUploadSlot,
    active: () => AppState.currentState === "active",
    current,
    requestId,
    errorText: galleryError,
    prepare: async () => {
      if (!current()) throw new Error("GALLERY_UPLOAD_STALE_SESSION");
      const prepared = await prepare(asset, current);
      return {
        input: {
          filename: prepared.filename,
          declaredMime: prepared.mime,
          declaredBytes: prepared.file.size,
        },
        dispose: () => {
          if (prepared.temporary) prepared.file.delete();
        },
        transfer: async (upload, controller) => {
          if (!current() || controller.signal.aborted) return;
          if (!unexpiredUpload(upload)) throw new Error("GALLERY_UPLOAD_EXPIRED");
          if (
            upload.postFields?.["Content-Type"] &&
            upload.postFields["Content-Type"] !== prepared.mime
          )
            throw new Error(
              "Для повтора выберите фотографию того же формата, что и исходный файл.",
            );
          if (!upload.postUrl || !upload.postFields)
            throw new Error("Ссылка загрузки недоступна. Выберите файл заново.");
          const body = new FormData();
          for (const [key, value] of Object.entries(upload.postFields)) body.append(key, value);
          body.append("file", {
            uri: prepared.file.uri,
            name: prepared.filename,
            type: prepared.mime,
          } as unknown as Blob);
          const background = AppState.addEventListener("change", (state) => {
            if (state !== "active") controller.abort();
          });
          // Native fetch can remain pending without a JS exception when an
          // S3 connection stalls. Cap the attempt, abort it, and let runUpload
          // mark the potentially committed POST as UNKNOWN (never auto-replay).
          let timeout: ReturnType<typeof setTimeout> | undefined;
          try {
            if (!current() || controller.signal.aborted)
              throw new Error("GALLERY_STORAGE_INTERRUPTED_UNCONFIRMED");
            const response = await Promise.race([
              fetch(upload.postUrl, { method: "POST", body, signal: controller.signal }),
              new Promise<never>((_, reject) => {
                timeout = setTimeout(() => {
                  controller.abort();
                  reject(new Error("GALLERY_STORAGE_TIMEOUT_UNCONFIRMED"));
                }, 120_000);
              }),
            ]);
            if (!current() || controller.signal.aborted)
              throw new Error("GALLERY_STORAGE_INTERRUPTED_UNCONFIRMED");
            if (!response.ok) throw await galleryUploadRejected(response);
          } finally {
            if (timeout !== undefined) clearTimeout(timeout);
            background.remove();
          }
        },
      };
    },
  });
}
const statusLabel: Record<UploadTask["status"], string> = {
  queued: "Ожидает загрузки",
  sending: "Загружается…",
  processing: "Обрабатывается…",
  ready: "Фото добавлено",
  failed: "Не удалось загрузить",
  expired: "Время загрузки истекло",
  unknown: "Статус подтверждения неизвестен",
  cancelling: "Проверяется отмена…",
  cancelled: "Загрузка отменена",
};
function UploadRow({ task, retry }: { task: UploadTask; retry: (id?: string) => void }) {
  const { viewer, cache, actor } = useGalleryContext();
  const foreground = useForeground();
  const current = () =>
    !!actor &&
    sameGalleryActor(actor) &&
    task.ownerId === actor.ownerId &&
    task.authEpoch === actor.authEpoch;
  const epoch = useGallerySession((state) => state.epoch);
  const dismissible = canDismissUploadTask(task.status);
  const [slowProcessing, setSlowProcessing] = useState(false);
  useEffect(() => {
    setSlowProcessing(false);
    if (task.status !== "processing") return;
    const timer = setTimeout(() => setSlowProcessing(true), 60_000);
    return () => clearTimeout(timer);
  }, [task.status, task.id, task.generation]);
  useEffect(() => {
    if (task.status !== "ready" && task.status !== "cancelled") return;
    const timer = setTimeout(
      () => dismissUploadTask(task.id, { epoch, generation: task.generation }),
      4_500,
    );
    return () => clearTimeout(timer);
  }, [task.id, task.status, task.generation, epoch]);
  const status = useQuery({
    queryKey: [
      ...galleryKeys.album(viewer, task.owner, task.albumId ?? "default"),
      "upload",
      task.upload?.uploadId,
      epoch,
      task.generation,
    ],
    queryFn: () => {
      if (!actor || !current()) throw new Error("GALLERY_SESSION_CHANGED");
      return pollTask(
        task.id,
        { epoch, generation: task.generation },
        galleryUploadForActor(actor, current),
      );
    },
    enabled: !!viewer && current() && !!task.upload && task.status === "processing" && foreground,
    refetchInterval: (query) =>
      foreground && !query.state.error &&
      (!query.state.data ||
        ["reserved", "uploaded", "processing"].includes(query.state.data.status))
        ? 5000
        : false,
    retry: false,
    gcTime: 0,
  });
  useEffect(() => {
    if (
      status.data &&
      ["ready", "failed", "expired", "cancelled"].includes(status.data.status) &&
      taskAt(task.id, { epoch, generation: task.generation })
    ) {
      void cache.invalidateQueries({
        queryKey: galleryKeys.owner(viewer, task.owner),
        predicate: (query) => !query.queryKey.includes("upload"),
      });
    }
  }, [status.data, task.id, task.generation, epoch, cache, viewer, task.owner]);
  const cancel = async () => {
    if (!actor || !current()) return;
    await cancelTask(task.id, epoch, galleryUploadForActor(actor, current), galleryError);
    if (useGallerySession.getState().epoch === epoch) {
      void cache.invalidateQueries({ queryKey: galleryKeys.owner(viewer, task.owner) });
    }
  };
  const active = ["queued", "sending", "processing", "unknown", "cancelling"].includes(task.status);
  const retryable = task.status === "failed" || task.status === "expired";
  return (
    <View style={s.uploadNotice}>
      <View style={s.uploadNoticeRow}>
        {active ? (
          <MaterialCommunityIcons name="progress-clock" size={20} color={COLORS.primary} />
        ) : (
          <MaterialCommunityIcons
            name={
              task.status === "ready"
                ? "check-circle-outline"
                : retryable
                  ? "alert-circle-outline"
                  : "close-circle-outline"
            }
            size={20}
            color={retryable ? "#A35A43" : COLORS.primary}
          />
        )}
        <View style={s.uploadNoticeText}>
          <Text numberOfLines={1} ellipsizeMode="middle" style={s.uploadFileName}>
            {task.filename}
          </Text>
          <Text numberOfLines={1} style={[s.uploadStatus, retryable && s.uploadStatusError]}>
            {statusLabel[task.status]}
          </Text>
        </View>
        {retryable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Повторить загрузку ${task.filename}, выбрать файл заново`}
            hitSlop={5}
            style={s.uploadNoticeAction}
            onPress={() => retry(task.upload?.uploadId ?? task.retrySourceId)}
          >
            <MaterialCommunityIcons name="refresh" size={23} color={COLORS.primary} />
          </Pressable>
        ) : null}
        {task.status === "unknown" && task.upload ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Проверить статус без повторной отправки"
            style={s.uploadNoticeAction}
            onPress={() => {
              if (current()) void status.refetch();
            }}
          >
            <MaterialCommunityIcons name="refresh" size={23} color={COLORS.primary} />
          </Pressable>
        ) : null}
        {active ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              task.status === "cancelling"
                ? "Повторить проверку отмены"
                : `Отменить загрузку ${task.filename}`
            }
            hitSlop={5}
            style={s.uploadNoticeAction}
            onPress={() => void cancel()}
          >
            <MaterialCommunityIcons
              name={task.status === "cancelling" ? "refresh" : "close"}
              size={22}
              color={COLORS.primary}
            />
          </Pressable>
        ) : null}
        {dismissible ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Закрыть сообщение о загрузке ${task.filename}`}
            hitSlop={5}
            style={s.uploadNoticeAction}
            onPress={() => dismissUploadTask(task.id, { epoch, generation: task.generation })}
          >
            <MaterialCommunityIcons name="close" size={20} color={COLORS.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {task.error ? (
        <Text selectable numberOfLines={2} accessibilityRole="alert" style={s.uploadNoticeError}>
          {task.error}
        </Text>
      ) : null}
      {slowProcessing && task.status === "processing" && !status.isError ? (
        <Pressable
          accessibilityRole="button"
          style={s.uploadStatusRetry}
          onPress={() => void status.refetch()}
        >
          <MaterialCommunityIcons name="refresh" size={16} color={COLORS.primary} />
          <Text style={s.uploadStatusRetryText}>
            Обработка занимает больше обычного · Проверить статус
          </Text>
        </Pressable>
      ) : null}
      {status.isError && (task.status === "processing" || task.status === "unknown") ? (
        <Pressable
          accessibilityRole="button"
          style={s.uploadStatusRetry}
          onPress={() => void status.refetch()}
        >
          <MaterialCommunityIcons name="refresh" size={16} color={COLORS.primary} />
          <Text style={s.uploadStatusRetryText}>Не удалось проверить статус · Повторить</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
export function UploadControls({
  owner,
  albumId,
  usedSlots = 0,
  retryUploadId,
  onRetried,
  compact = false,
  inlineHeader = false,
  leadingAction,
  minimal = false,
}: {
  owner: string;
  albumId?: string;
  usedSlots?: number;
  retryUploadId?: string;
  onRetried?: () => void;
  compact?: boolean;
  inlineHeader?: boolean;
  leadingAction?: ReactNode;
  minimal?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { viewer, cache, actor, username } = useGalleryContext();
  const tasks = useGallerySession((state) => state.tasks);
  const pickInFlight = useRef(false);
  const mounted = useRef(true);
  const routeRef = useRef({ owner, albumId });
  routeRef.current = { owner, albumId };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const pick = async (retryId?: string) => {
    if (
      pickInFlight.current ||
      !actor ||
      !sameGalleryActor(actor) ||
      username !== owner ||
      !mounted.current ||
      AppState.currentState !== "active"
    )
      return;
    // Same as Web: a lost S3/confirm acknowledgement blocks further writes
    // to this album until the pending upload is reconciled or cancelled.
    if (useGallerySession.getState().tasks.some((task) =>
      task.owner === owner && task.ownerId === actor.ownerId &&
      task.authEpoch === actor.authEpoch &&
      (!albumId || task.albumId === albumId) &&
      (task.status === "unknown" || task.status === "cancelling"))) {
      setError("Есть неподтверждённая загрузка. Проверьте её статус или отмените перед добавлением нового фото.");
      return;
    }
    pickInFlight.current = true;
    const capturedActor = actor;
    const capturedOwner = owner;
    const capturedAlbumId = albumId;
    const epoch = useGallerySession.getState().epoch;
    const valid = () =>
      mounted.current &&
      routeRef.current.owner === capturedOwner &&
      routeRef.current.albumId === capturedAlbumId &&
      useGallerySession.getState().epoch === epoch &&
      sameGalleryActor(capturedActor) &&
      useAuthStore.getState().user?.username === capturedOwner;
    setBusy(true);
    setError("");
    let validTask = valid;
    try {
      let retryTask = retryId
        ? useGallerySession
            .getState()
            .tasks.find(
              (t) =>
                t.owner === owner &&
                t.ownerId === capturedActor.ownerId &&
                t.authEpoch === capturedActor.authEpoch &&
                t.status !== "unknown" &&
                (t.upload?.uploadId === retryId ||
                  t.retrySourceId === retryId ||
                  t.retryOperation?.parentId === retryId),
            )
        : undefined;
      if (retryId && !retryTask) {
        // PhotoActionsMenu opens a historical failed photo without an in-memory task.
        // Verify the exact owner-scoped server upload first: a reserved/processing
        // upload could have a committed but lost ACK, so it must NOT be re-sent.
        if (!valid()) return;
        const existing = await galleryUploadForActor(capturedActor, valid).getUpload(retryId);
        if (!valid()) return;
        if (
          existing.uploadId !== retryId ||
          (capturedAlbumId && existing.albumId !== capturedAlbumId) ||
          !["failed", "expired"].includes(existing.status)
        ) {
          setError("Повторная загрузка недоступна. Проверьте статус фотографии.");
          return;
        }
        retryTask = {
          id: requestId(),
          owner: capturedOwner,
          ownerId: capturedActor.ownerId,
          authEpoch: capturedActor.authEpoch,
          albumId: existing.albumId,
          filename: "Фотография",
          status: "failed",
          generation: 0,
          retrySourceId: retryId,
        };
        const initial = retryTask;
        useGallerySession.setState((state) => ({ tasks: [...state.tasks, initial] }));
      }
      if (retryTask?.cancelRequested || retryTask?.status === "cancelled") return;
      const pickFence = retryTask ? { epoch, generation: retryTask.generation + 1 } : undefined;
      if (retryTask && pickFence) {
        updateTask(
          retryTask.id,
          { generation: pickFence.generation },
          { epoch, generation: retryTask.generation },
        );
        retryTask = { ...retryTask, generation: pickFence.generation };
      }
      validTask = () => valid() && (!retryTask || !!taskAt(retryTask.id, pickFence!));
      const sdkValid = () => validTask() && AppState.currentState === "active";
      if (!sdkValid()) return;
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!sdkValid()) return;
      if (!permission.granted) {
        Alert.alert("Доступ к фотографиям", "Разрешите доступ к фото в настройках телефона.", [
          { text: "Отмена", style: "cancel" },
          {
            text: "Настройки",
            onPress: () => {
              if (validTask()) void Linking.openSettings();
            },
          },
        ]);
        return;
      }
      if (!sdkValid()) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: !retryId,
        selectionLimit: retryId ? 1 : Math.max(1, 200 - usedSlots),
        quality: 1,
      });
      if (result.canceled || !result.assets.length || !sdkValid()) return;
      const selected = result.assets.map((asset) => ({
        asset,
        task: retryTask
          ? {
              ...retryTask,
              filename: asset.fileName ?? "Фотография",
              status: "queued" as const,
            }
          : {
              id: requestId(),
              owner,
              ownerId: capturedActor.ownerId,
              authEpoch: capturedActor.authEpoch,
              albumId,
              filename: asset.fileName ?? "Фотография",
              status: "queued" as const,
              generation: 0,
            },
      }));
      if (retryTask && pickFence) updateTask(retryTask.id, selected[0].task, pickFence);
      else
        useGallerySession.setState((state) => ({
          tasks: [...state.tasks, ...selected.map((item) => item.task)],
        }));
      await Promise.all(
        selected.map(({ asset, task }) => send(asset, task, epoch, capturedActor, validTask)),
      );
      if (validTask()) {
        await cache.invalidateQueries({ queryKey: galleryKeys.owner(viewer, owner) });
        if (validTask()) onRetried?.();
      }
    } catch (e) {
      reportClientError(new Error("GALLERY_UPLOAD_PICKER_OR_PREPARE_UNKNOWN"), {
        issueKey: "GalleryUploadControls",
        keys: { operation: "pick_and_prepare" },
      });
      if (validTask()) setError(galleryError(e));
    } finally {
      pickInFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const visibleTasks = tasks.filter(
    (t) =>
      !!actor &&
      sameGalleryActor(actor) &&
      t.owner === owner &&
      t.ownerId === actor.ownerId &&
      t.authEpoch === actor.authEpoch &&
      (!albumId || t.albumId === albumId),
  );
  const uploadInProgress = visibleTasks.some((t) =>
    ["queued", "sending", "processing", "cancelling"].includes(t.status),
  );
  const unresolved = visibleTasks.some((t) =>
    t.status === "unknown" || t.status === "cancelling",
  );
  return (
    <View style={inlineHeader || minimal ? s.albumsUploadSection : s.section}>
      {inlineHeader ? (
        <View style={s.albumsActions}>
          {leadingAction ? <View style={s.albumsAction}>{leadingAction}</View> : null}
          <View style={s.albumsAction}>
            <Button
              label="Добавить фото"
              loading={busy}
              variant="primary"
              animatedPress
              height={44}
              fontSize={13}
              lineHeight={18}
              horizontalPadding={0}
              verticalPadding={0}
              borderRadius={14}
              labelStyle={{ marginHorizontal: 0, marginVertical: 0 }}
              disabled={
                busy || unresolved || !actor || username !== owner || (!retryUploadId && usedSlots >= 200)
              }
              onPress={() => void pick(retryUploadId)}
            />
          </View>
        </View>
      ) : (
        <Button
          label={retryUploadId ? "Выбрать файл заново" : "Добавить фотографии"}
          loading={busy}
          height={minimal ? 44 : undefined}
          fontSize={minimal ? 14 : undefined}
          borderRadius={minimal ? 14 : undefined}
          accessibilityHint="JPG, PNG, WebP, HEIC · до 10 МиБ"
          disabled={busy || unresolved || !actor || username !== owner || (!retryUploadId && usedSlots >= 200)}
          onPress={() => void pick(retryUploadId)}
        />
      )}
      {!compact && !minimal ? (
        inlineHeader ? (
          <View style={s.albumsHintRow}>
            <Text style={s.albumsHint}>JPG, PNG, WebP, HEIC · до 10 МиБ</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Правила загрузки фотографий"
              hitSlop={8}
              style={s.albumsHintHelp}
              onPress={() =>
                Alert.alert(
                  "Загрузка фотографий",
                  "Поддерживаются JPG, PNG, WebP до 10 МиБ. HEIC преобразуется в JPG. Не закрывайте приложение до завершения загрузки.",
                )
              }
            >
              <MaterialCommunityIcons
                name="information-outline"
                size={19}
                color={COLORS.textSecondary}
              />
            </Pressable>
          </View>
        ) : (
          <Text style={s.muted}>
            JPG, PNG, WebP до 10 МиБ. HEIC преобразуется в JPG. Не закрывайте приложение до
            завершения загрузки.
          </Text>
        )
      ) : null}
      {(inlineHeader || minimal) && uploadInProgress ? (
        <Text style={s.albumsUploadWarning}>Не закрывайте приложение до завершения загрузки.</Text>
      ) : null}
      {unresolved ? (
        <Text style={s.albumsUploadWarning} accessibilityRole="alert">
          Новые фото временно заблокированы. Проверьте или отмените неподтверждённую загрузку.
        </Text>
      ) : null}
      {error ? (
        <Text selectable accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      {!compact &&
        visibleTasks.map((task) => (
          <UploadRow key={task.id} task={task} retry={(id) => void pick(id)} />
        ))}
    </View>
  );
}
