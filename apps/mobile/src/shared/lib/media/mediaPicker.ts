import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

type MediaType = "images" | "videos";
type Options = Omit<ImagePicker.ImagePickerOptions, "mediaTypes" | "legacy"> & {
  mediaTypes: MediaType[];
};
type Readiness = {
  onPermissionDenied?: () => void;
  canLaunch?: () => boolean;
};

export class MediaPickerError extends Error {}

const unavailableFile = "Не удалось открыть выбранный файл. Проверьте подключение к интернету или выберите файл заново.";
const mimeByExtension: Readonly<Record<string, string>> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", heic: "image/heic", heif: "image/heif", avif: "image/avif",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  "3gp": "video/3gpp", mkv: "video/x-matroska",
};

function normalizeAndroidAsset(asset: ImagePicker.ImagePickerAsset, types: MediaType[], fileSize: number) {
  // Expo copies recognized selections to private cache while it has provider access.
  // A raw provider URI means Expo could not identify and export the selection.
  if (!asset.uri?.startsWith("file://")) throw new MediaPickerError(unavailableFile);
  if (!fileSize) throw new MediaPickerError(unavailableFile);

  const fileName = asset.fileName || asset.uri.split("/").pop();
  const extension = (asset.fileName || (asset.type === "video" ? "" : fileName))
    ?.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
  // Expo gives every cached video a .mp4 suffix, independent of its container.
  const mimeType = asset.mimeType && asset.mimeType !== "application/octet-stream"
    ? asset.mimeType : extension && mimeByExtension[extension];
  const type = asset.type ?? (mimeType?.startsWith("image/") ? "image" :
    mimeType?.startsWith("video/") ? "video" : undefined);
  if ((type !== "image" || !types.includes("images")) &&
      (type !== "video" || !types.includes("videos"))) {
    throw new MediaPickerError("Выбранный тип файла не поддерживается. Выберите другой файл.");
  }
  return { ...asset, type, fileName, fileSize, mimeType };
}

export async function pickMedia(options: Options, readiness: Readiness = {}):
Promise<ImagePicker.ImagePickerResult> {
  const canceled = { canceled: true, assets: null } as const;
  const { canLaunch, onPermissionDenied } = readiness;
  if (canLaunch && !canLaunch()) return canceled;

  if (Platform.OS !== "android") {
    if (onPermissionDenied) {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (canLaunch && !canLaunch()) return canceled;
      if (!permission.granted) {
        onPermissionDenied();
        return canceled;
      }
    }
    return ImagePicker.launchImageLibraryAsync(options);
  }

  const limit = options.allowsMultipleSelection ? options.selectionLimit : 1;
  if (limit === 0) return canceled;
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0)) {
    return canceled;
  }

  try {
    const result = await ImagePicker.launchImageLibraryAsync({ ...options, legacy: false });
    if (result.canceled || !result.assets.length) return canceled;
    if (limit !== undefined && result.assets.length > limit) {
      throw new MediaPickerError(`Выберите файлов за один раз: не более ${limit}.`);
    }
    const { File } = await import("expo-file-system");
    const assets = result.assets.map(asset => {
      const size = asset.uri?.startsWith("file://") ? new File(asset.uri).size : 0;
      return normalizeAndroidAsset(asset, options.mediaTypes, size);
    });
    return { canceled: false, assets };
    // Screens report the error with their own operation context.
    // eslint-disable-next-line @gafus/require-client-catch-tracer
  } catch (cause) {
    if (cause instanceof MediaPickerError) throw cause;
    throw new MediaPickerError(unavailableFile, { cause });
  }
}
