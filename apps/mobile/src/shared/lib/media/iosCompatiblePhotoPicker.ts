import { Platform } from "react-native";
import type { UIImagePickerPreferredAssetRepresentationMode } from "expo-image-picker";

/**
 * iOS PHPicker defaults to "current" and can hand us an original HEIC/HEIF.
 * Request a compatible representation before native JPEG/WebP compression.
 * Android has no asset-representation setting and remains unchanged.
 */
export function iosCompatiblePhotoPicker(platform: string = Platform.OS) {
  return platform === "ios"
    ? { preferredAssetRepresentationMode: "compatible" as UIImagePickerPreferredAssetRepresentationMode }
    : {};
}
