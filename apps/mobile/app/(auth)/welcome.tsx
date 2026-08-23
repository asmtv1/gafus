import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Snackbar, Text } from "react-native-paper";
import { useRouter } from "expo-router";
import { TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { Image } from "expo-image";
import { FontAwesome5 } from "@expo/vector-icons";

import { Button } from "@/shared/components/ui";
import { COLORS, SPACING, FONTS } from "@/shared/config";
import { useLayout, useVkLogin } from "@/shared/hooks";
import { useMobileAppPublicConfig } from "@/shared/lib/api/public-config-query";

/**
 * Welcome страница (Landing) - точное соответствие веб-версии
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const layout = useLayout();
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
  const { data: publicConfigResponse, isFetched: publicConfigFetched } = useMobileAppPublicConfig();
  const { handleVkLogin, isVkLoading } = useVkLogin({
    onError: (msg) => setSnackbar({ visible: true, message: msg }),
  });

  // Только iOS: кнопка VK зависит от флага с бэка. Android, web и остальные — всегда показываем VK.
  const showVkButton =
    Platform.OS !== "ios"
      ? true
      : publicConfigFetched && Boolean(publicConfigResponse?.data?.vkLoginEnabledOnIos);

  const imgW = layout.contentWidth(SPACING.md * 4);
  const titleSize = layout.moderateScale(88, 0.35);
  const pawW = layout.scale(141);
  const pawH = layout.scale(136);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        bounces={false}
      >
        {/* Шапка с лапкой */}
        <View style={styles.pawContainer}>
          <Text style={[styles.pawText, { fontSize: layout.moderateScale(15) }]}>учимся</Text>
          <Image
            source={require("../../assets/images/paw.png")}
            style={[styles.paw, { width: pawW, height: pawH }]}
            contentFit="contain"
          />
          <Text style={[styles.pawText, { fontSize: layout.moderateScale(15) }]}>вместе</Text>
        </View>

        {/* Заголовок */}
        <Text style={[styles.title, { fontSize: Math.min(titleSize, 92) }]}>Гафус!</Text>

        {/* Приветственная иллюстрация */}
        <Image
          source={require("../../assets/images/firstscrin-transparent.png")}
          style={[styles.welcomeImage, { width: imgW }]}
          contentFit="contain"
        />

        {/* Кнопки — как в остальном клиенте */}
        <View style={styles.buttonsContainer}>
          <Button
            label="Войти"
            variant="primary"
            onPress={() => router.push("/login")}
            style={styles.button}
          />
          <Button
            label="Регистрация"
            variant="outline"
            buttonColor="#E9E2CF"
            onPress={() => router.push("/register")}
            style={[styles.button, styles.registerButton]}
          />
          {showVkButton ? (
            <Pressable
              style={({ pressed }) => [
                styles.vkButton,
                pressed && styles.vkButtonPressed,
                isVkLoading && styles.vkButtonDisabled,
              ]}
              onPress={handleVkLogin}
              disabled={isVkLoading}
              accessibilityRole="button"
              accessibilityLabel="Регистрация и вход через VK"
              accessibilityState={{ disabled: isVkLoading, busy: isVkLoading }}
            >
              {isVkLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <View style={styles.vkLogoSurface}>
                  <FontAwesome5 name="vk" size={20} color="#0077FF" />
                </View>
              )}
              <Text style={styles.vkButtonText} numberOfLines={1} adjustsFontSizeToFit>
                {isVkLoading ? "Загрузка..." : "Регистрация и вход через VK"}
              </Text>
            </Pressable>
          ) : null}
        </View>

      </ScrollView>

      {/* Подпись закреплена у нижнего края экрана */}
      <Text
        pointerEvents="none"
        style={[
          styles.subtitle,
          {
            fontSize: layout.moderateScale(12),
            maxWidth: layout.scale(320),
          },
        ]}
      >
        Умные пошаговые тренировки, отдых и обучение — всё в одном месте.
      </Text>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: "" })}
        duration={3000}
        action={{
          label: "OK",
          onPress: () => setSnackbar({ visible: false, message: "" }),
        }}
      >
        {snackbar.message}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingBottom: 64,
    gap: 16,
  },
  // Шапка с лапкой - как в веб
  pawContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    width: "100%",
    overflow: "visible",
    marginTop: 12,
    marginBottom: -18,
  },
  pawText: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: "400",
    fontFamily: FONTS.montserrat,
  },
  paw: {
    marginLeft: 12,
    marginTop: -24,
  },
  title: {
    fontWeight: "400",
    color: COLORS.primary,
    marginTop: -14,
    marginBottom: -4,
    fontFamily: FONTS.impact,
  },
  welcomeImage: {
    aspectRatio: 1280 / 849,
  },
  buttonsContainer: {
    marginTop: 4,
    gap: 12,
    width: "100%",
    alignItems: "stretch",
  },
  button: {
    minHeight: 48,
  },
  registerButton: {
    borderColor: "rgba(99, 97, 40, 0.42)",
    boxShadow: "0 7px 12px rgba(53, 52, 16, 0.22)",
    elevation: 7,
  },
  vkButton: {
    width: "100%",
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 18,
    borderRadius: 18,
    borderCurve: "continuous",
    backgroundColor: "#0077FF",
    boxShadow: "0 7px 12px rgba(0, 77, 166, 0.28)",
    elevation: 7,
  },
  vkButtonPressed: {
    backgroundColor: "#0067E0",
    boxShadow: "0 2px 4px rgba(0, 77, 166, 0.22)",
    elevation: 2,
    transform: [{ translateY: 4 }, { scale: 0.99 }],
  },
  vkButtonDisabled: {
    opacity: 0.58,
  },
  vkLogoSurface: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  vkButtonText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 19,
    fontFamily: FONTS.montserratBold,
    color: "#FFFFFF",
  },
  subtitle: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    color: COLORS.primary,
    opacity: 0.8,
    lineHeight: 15.6,
    textAlign: "center",
    fontFamily: FONTS.montserrat,
  },
});
