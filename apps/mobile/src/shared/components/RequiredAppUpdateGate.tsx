import type { ReactNode } from "react";
import { useState } from "react";
import * as Application from "expo-application";
import * as Linking from "expo-linking";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BORDER_RADIUS, COLORS, FONTS, SPACING } from "@/shared/config";
import { useMobileAppPublicConfig } from "@/shared/lib/api/public-config-query";
import { isAppUpdateRequired } from "@/shared/lib/app-version";
import { reportClientError } from "@/shared/lib/tracer";

interface RequiredAppUpdateGateProps {
  children: ReactNode;
}

interface RequiredAppUpdateScreenProps {
  currentVersion: string;
  requiredVersion: string;
  storeUrl: string;
}

function RequiredAppUpdateScreen({
  currentVersion,
  requiredVersion,
  storeUrl,
}: RequiredAppUpdateScreenProps) {
  const insets = useSafeAreaInsets();
  const [isOpeningStore, setIsOpeningStore] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const openStore = async () => {
    if (isOpeningStore) return;
    setIsOpeningStore(true);
    setOpenError(null);
    try {
      await Linking.openURL(storeUrl);
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "RequiredAppUpdate",
        keys: { operation: "open_store", platform: Platform.OS },
      });
      setOpenError("Не удалось открыть магазин. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      setIsOpeningStore(false);
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        paddingTop: Math.max(insets.top, SPACING.xl),
        paddingBottom: Math.max(insets.bottom, SPACING.xl),
        paddingHorizontal: SPACING.lg,
      }}
    >
      <View
        style={{
          gap: SPACING.lg,
          padding: SPACING.lg,
          borderRadius: BORDER_RADIUS.xl,
          borderCurve: "continuous",
          backgroundColor: COLORS.cardBackground,
          borderWidth: 2,
          borderColor: COLORS.primary,
        }}
      >
        <View style={{ gap: SPACING.sm }}>
          <Text
            selectable
            style={{
              color: COLORS.text,
              fontFamily: FONTS.montserratBold,
              fontSize: 28,
              lineHeight: 34,
              textAlign: "center",
            }}
          >
            Нужно обновить приложение
          </Text>
          <Text
            selectable
            style={{
              color: COLORS.textSecondary,
              fontFamily: FONTS.montserrat,
              fontSize: 17,
              lineHeight: 25,
              textAlign: "center",
            }}
          >
            Чтобы продолжить пользоваться Гафусом, установите последнюю версию из магазина.
          </Text>
        </View>

        <Text
          selectable
          style={{
            color: COLORS.textSecondary,
            fontFamily: FONTS.montserratMedium,
            fontSize: 14,
            textAlign: "center",
            fontVariant: ["tabular-nums"],
          }}
        >
          Установлена версия {currentVersion} · требуется {requiredVersion}
        </Text>

        {openError ? (
          <Text
            selectable
            style={{
              color: COLORS.error,
              fontFamily: FONTS.montserratMedium,
              fontSize: 14,
              lineHeight: 20,
              textAlign: "center",
            }}
          >
            {openError}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Обновить приложение в магазине"
          disabled={isOpeningStore}
          onPress={() => void openStore()}
          style={({ pressed }) => ({
            minHeight: 54,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: BORDER_RADIUS.lg,
            borderCurve: "continuous",
            backgroundColor: COLORS.primary,
            opacity: pressed || isOpeningStore ? 0.78 : 1,
          })}
        >
          {isOpeningStore ? (
            <ActivityIndicator color={COLORS.onPrimary} />
          ) : (
            <Text
              style={{
                color: COLORS.onPrimary,
                fontFamily: FONTS.montserratBold,
                fontSize: 18,
              }}
            >
              Обновить приложение
            </Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

export function RequiredAppUpdateGate({ children }: RequiredAppUpdateGateProps) {
  const configQuery = useMobileAppPublicConfig();

  if (__DEV__ || (Platform.OS !== "ios" && Platform.OS !== "android")) {
    return children;
  }

  const config = configQuery.data?.data;
  const currentVersion = Application.nativeApplicationVersion;
  if (!config || !currentVersion) {
    return children;
  }

  const requiredVersion = config.minimumSupportedVersion?.[Platform.OS];
  const storeUrl = config.storeUrl?.[Platform.OS];
  if (
    typeof requiredVersion !== "string" ||
    typeof storeUrl !== "string" ||
    !isAppUpdateRequired(currentVersion, requiredVersion)
  ) {
    return children;
  }

  return (
    <RequiredAppUpdateScreen
      currentVersion={currentVersion}
      requiredVersion={requiredVersion}
      storeUrl={storeUrl}
    />
  );
}
