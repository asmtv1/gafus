import { Asset } from "expo-asset";
import { Image } from "expo-image";

const animatedMascotModule = require("../../../../assets/images/loading-mascot-router.gif");
const mascotPosterModule = require("../../../../assets/images/loading-mascot-router-poster.png");

export const animatedMascotAsset = Asset.fromModule(animatedMascotModule);
export const mascotPosterAsset = Asset.fromModule(mascotPosterModule);

let warmUpPromise: Promise<void> | null = null;

function assetUri(asset: Asset): string {
  return asset.localUri ?? asset.uri;
}

/**
 * Готовит статичный кадр до скрытия нативного splash screen. GIF догружается
 * следом в фоне: промежуточные экраны сразу показывают собаку без пустого окна.
 */
export function warmUpLoadingMascot(): Promise<void> {
  if (warmUpPromise) return warmUpPromise;

  warmUpPromise = mascotPosterAsset
    .downloadAsync()
    .then(async (poster) => {
      await Image.prefetch(assetUri(poster), { cachePolicy: "memory-disk" });

      void animatedMascotAsset
        .downloadAsync()
        .then((animation) => Image.prefetch(assetUri(animation), { cachePolicy: "memory-disk" }))
        .catch(() => undefined);
    })
    .catch((error) => {
      warmUpPromise = null;
      throw error;
    });

  return warmUpPromise;
}

export function getMascotPosterSource() {
  return { uri: assetUri(mascotPosterAsset) };
}

export function getAnimatedMascotSource() {
  return { uri: assetUri(animatedMascotAsset) };
}
