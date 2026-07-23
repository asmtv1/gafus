import { useFonts } from "expo-font";
import { Montserrat_400Regular } from "@expo-google-fonts/montserrat/400Regular";
import { Montserrat_500Medium } from "@expo-google-fonts/montserrat/500Medium";
import { Montserrat_700Bold } from "@expo-google-fonts/montserrat/700Bold";
import { FONTS } from "@/shared/config";

interface AppFontsState {
  fontsReady: boolean;
  fontError: Error | null;
}

/**
 * New native builds resolve these names synchronously from the embedded font
 * bundle. Runtime loading remains as an OTA-safe fallback for older binaries
 * and Expo Go, where the config plugin has not run.
 */
export function useAppFonts(): AppFontsState {
  const [fontsReady, fontError] = useFonts({
    [FONTS.montserrat]: Montserrat_400Regular,
    [FONTS.montserratMedium]: Montserrat_500Medium,
    [FONTS.montserratBold]: Montserrat_700Bold,
    Impact: require("../../../assets/fonts/Impact.ttf"),
    Moscow2024: require("../../../assets/fonts/MOSCOW2024.otf"),
  });

  return { fontsReady, fontError };
}
