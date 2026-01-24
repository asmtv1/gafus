import { View, StyleSheet, Pressable, Dimensions } from "react-native";
import { Text } from "react-native-paper";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { COLORS, SPACING, FONTS } from "@/constants";

// Картинки с сервера (production URL)

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/**
 * Welcome страница (Landing) - точное соответствие веб-версии
 */
export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      {/* Шапка с лапкой */}
      <View style={styles.pawContainer}>
        <Text style={styles.pawText}>гуляем</Text>
        <Image
          source={require("../../assets/images/paw.png")}
          style={styles.paw}
          contentFit="contain"
        />
        <Text style={styles.pawText}>вместе</Text>
      </View>

      {/* Заголовок */}
      <Text style={styles.title}>Гафус!</Text>

      {/* Диалог с собакой - позиционирование как в веб */}
      <View style={styles.dialogContainer}>
        <Image
          source={require("../../assets/images/logo.png")}
          style={styles.logo}
          contentFit="contain"
        />
        <View style={styles.speechBubbleWrapper}>
          <View style={styles.speechBubble}>
            <Text style={styles.speechText}>
              Добро ГАФ пожаловать!{"\n"}Я - мудрый Гафус!{"\n"}Я буду помогать тебе{"\n"}с
              тренировками!
            </Text>
          </View>
          <View style={styles.speechBubbleTail} />
        </View>
      </View>

      {/* Кнопки */}
      <View style={styles.buttonsContainer}>
        <Link href="/login" asChild>
          <Pressable style={styles.loginButton}>
            <Text style={styles.loginButtonText}>войти</Text>
          </Pressable>
        </Link>

        <Link href="/register" asChild>
          <Pressable style={styles.registerButton}>
            <Text style={styles.registerButtonText}>регистрация</Text>
          </Pressable>
        </Link>
      </View>

      {/* Подпись */}
      <Text style={styles.subtitle}>
        Умные пошаговые тренировки, отдых и обучение — всё в одном месте.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
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
    width: 141,
    height: 136,
    marginLeft: 12,
    marginTop: 10,
  },
  // Заголовок - размер как в веб (110px, но адаптировано)
  // Используем Impact (системный) или Montserrat как fallback
  title: {
    fontSize: Math.min(110, SCREEN_WIDTH * 0.28),
    fontWeight: "400",
    color: COLORS.primary,
    marginTop: -6,
    marginBottom: 8,
    fontFamily: FONTS.impact, // Impact для соответствия веб-версии
  },
  // Диалог - позиционирование как в веб с left: -70px
  dialogContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: -30,
    marginTop: 55,
  },
  logo: {
    width: 230,
    height: 250,
    marginTop: -40,
    marginRight: 50,
  },
  speechBubbleWrapper: {
    position: "relative",
    marginTop: -250,
    marginLeft: -85,
  },
  speechBubble: {
    backgroundColor: "#f5f0d8",
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 10,
    minWidth: 210,
    maxWidth: 280,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  speechBubbleTail: {
    position: "absolute",
    width: 0,
    height: 0,
    borderTopWidth: 17,
    borderTopColor: "transparent",
    borderBottomWidth: 23,
    borderBottomColor: "transparent",
    borderRightWidth: 26,
    borderRightColor: "#f5f0d8",
    top: 75,
    right: 190,
    transform: [{ rotate: "-0.8rad" }],
  },

  speechText: {
    fontFamily: "Courier New", // Соответствует веб-версии
    fontSize: 14,
    lineHeight: 20,
    color: "#4a4a2a",
    textAlign: "center",
    fontWeight: "500",
  },
  // Кнопки - размеры как в веб (221x48)
  buttonsContainer: {
    marginTop: 0,
    gap: 14,
    width: "100%",
    alignItems: "center",
  },
  loginButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: COLORS.cardBackground,
    width: 221,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  loginButtonText: {
    color: COLORS.cardBackground,
    fontSize: 25,
    fontWeight: "400",
    fontFamily: FONTS.impact, // Impact для соответствия веб-версии
  },
  registerButton: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: COLORS.primary,
    width: 221,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  registerButtonText: {
    color: COLORS.primary,
    fontSize: 25,
    fontWeight: "400",
    fontFamily: FONTS.impact, // Impact для соответствия веб-версии
  },
  // Подпись - как в веб
  subtitle: {
    color: COLORS.primary,
    opacity: 0.8,
    fontSize: 12,
    lineHeight: 15.6,
    textAlign: "center",
    marginTop: "auto",
    marginBottom: SPACING.lg,
    maxWidth: 320,
    fontFamily: FONTS.montserrat,
  },
});
