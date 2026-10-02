import { createContext, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { COLORS } from "@/shared/config";
import { PaperTextureBackground } from "./PaperTextureBackground";

export const SharedSkyBackgroundContext = createContext(false);

/** Один непрерывный фон для содержимого вкладок и прозрачного меню. */
export function SharedSkyBackground({ children }: { children: ReactNode }) {
  return (
    <View style={styles.container}>
      <PaperTextureBackground />
      <SharedSkyBackgroundContext.Provider value={true}>
        {children}
      </SharedSkyBackgroundContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
});
