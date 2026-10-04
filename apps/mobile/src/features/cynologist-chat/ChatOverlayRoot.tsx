import { Fragment, type ComponentType, type PropsWithChildren } from "react";
import { TurboModuleRegistry, View } from "react-native";
import { COLORS, FONTS } from "@/shared/config";

// Overlay positions are measured in window coordinates: the host must cover the
// entire navigator, rather than start below the chat tabs. Keep Expo Go guarded.
const Provider: ComponentType<PropsWithChildren<{ style?: object }>> = TurboModuleRegistry.get(
  "StreamVideoThumbnail",
)
  ? require("stream-chat-expo").OverlayProvider
  : Fragment;

export function ChatOverlayRoot({ children }: PropsWithChildren) {
  return (
    <View style={{ flex: 1 }}>
      <Provider
        style={{
          semantics: { accentPrimary: COLORS.primary, borderUtilityActive: COLORS.primary },
          messageMenu: {
            actionListItem: {
              title: { fontFamily: FONTS.montserrat, fontSize: 15 },
            },
          },
        }}
      >
        {children}
      </Provider>
    </View>
  );
}
