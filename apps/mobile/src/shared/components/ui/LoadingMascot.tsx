import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import { getAnimatedMascotSource, getMascotPosterSource } from "./loadingMascotAssets";

/** Единый размер анимированного лоудера на всех экранах. */
export const STANDARD_LOADING_MASCOT_PX = 168;

/**
 * Общий визуальный слой загрузки. Статичный первый кадр виден сразу,
 * пока Android или iOS декодирует анимированный GIF поверх него.
 */
export function LoadingMascot({ size = STANDARD_LOADING_MASCOT_PX }: { size?: number } = {}) {
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Image
        source={getMascotPosterSource()}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={0}
      />
      <Image
        source={getAnimatedMascotSource()}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={0}
      />
    </View>
  );
}
