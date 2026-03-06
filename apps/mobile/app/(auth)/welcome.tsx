import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Snackbar, Text } from "react-native-paper";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { Button } from "@/shared/components/ui";
import { COLORS, SPACING, FONTS } from "@/constants";
import { useLayout, useVkLogin } from "@/shared/hooks";

/**
 * Welcome страница (Landing) - точное соответствие веб-версии
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const layout = useLayout();
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
  const { handleVkLogin, isVkLoading } = useVkLogin({
    onError: (msg) => setSnackbar({ visible: true, message: msg }),
  });
  const imgW = layout.contentWidth(SPACING.md * 4);
  const titleSize = layout.moderateScale(110, 0.4);
  const pawW = layout.scale(141);
  const pawH = layout.scale(136);

  return (
    <SafeAreaView style={styles.container}>
      {/* Шапка с лапкой */}
      <View style={styles.pawContainer}>
        <Text style={[styles.pawText, { fontSize: layout.moderateScale(15) }]}>
          учимся
        </Text>
        <Image
          source={require("../../assets/images/paw.png")}
          style={[styles.paw, { width: pawW, height: pawH }]}
          contentFit="contain"
        />
        <Text style={[styles.pawText, { fontSize: layout.moderateScale(15) }]}>
          вместе
        </Text>
      </View>

      {/* Заголовок */}
      <Text style={[styles.title, { fontSize: Math.min(titleSize, 110) }]}>
        Гафус!
      </Text>

      {/* Приветственная иллюстрация */}
      <Image
        source={require("../../assets/images/firstscrin.png")}
        style={[styles.welcomeImage, { width: imgW, aspectRatio: 1 }]}
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
          onPress={() => router.push("/register")}
          style={styles.button}
        />
        <Pressable
          style={[styles.vkButton, { width: "100%" }]}
          onPress={handleVkLogin}
          disabled={isVkLoading}
        >
          <Text style={styles.vkButtonText}>
            {isVkLoading ? "Загрузка..." : "Войти через VK"}
          </Text>
        </Pressable>
      </View>

      {/* Подпись */}
      <Text
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
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    gap: 20,
  },
  // Шапка с лапкой - как в веб
  pawContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    width: "100%",
    overflow: "visible",
  },
  pawText: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: "400",
    fontFamily: FONTS.montserrat,
  },
  paw: {
    marginLeft: 12,
    marginTop: 10,
  },
  title: {
    fontWeight: "400",
    color: COLORS.primary,
    marginTop: -20,
    marginBottom: 0,
    fontFamily: FONTS.impact,
  },
  welcomeImage: {
    marginTop: -50,
    marginBottom: -SPACING.lg,
  },
  buttonsContainer: {
    marginTop: 20,
    gap: SPACING.sm,
    width: "100%",
    alignItems: "stretch",
  },
  button: {
    minHeight: 48,
  },
  vkButton: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 5,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    backgroundColor: "transparent",
  },
  vkButtonText: {
    fontSize: 12,
    fontFamily: FONTS.montserrat,
    color: COLORS.primary,
  },
  subtitle: {
    color: COLORS.primary,
    opacity: 0.8,
    lineHeight: 15.6,
    textAlign: "center",
    marginBottom: SPACING.lg,
    fontFamily: FONTS.montserrat,
  },
});
