import { useFonts } from "expo-font";
import { Montserrat_400Regular } from "@expo-google-fonts/montserrat/400Regular";
import { Montserrat_500Medium } from "@expo-google-fonts/montserrat/500Medium";
import { Montserrat_700Bold } from "@expo-google-fonts/montserrat/700Bold";

interface AppFontsState {
  fontsReady: boolean;
  fontError: Error | null;
}

/** Web has no native font bundle, so it keeps the asynchronous loader. */
export function useAppFonts(): AppFontsState {
  const [fontsReady, fontError] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_700Bold,
    Impact: require("../../../assets/fonts/Impact.ttf"),
    Moscow2024: require("../../../assets/fonts/MOSCOW2024.otf"),
  });

  return { fontsReady, fontError: fontError ?? null };
}
