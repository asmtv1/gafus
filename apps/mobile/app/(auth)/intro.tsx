import { Image } from "expo-image";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { type GestureResponderEvent, Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TexturedSafeAreaView } from "@/shared/components";
import { Button } from "@/shared/components/ui";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import { readMobileIntroState, saveMobileIntroState, type MobileIntroState } from "@/shared/lib/mobile-intro-state";
import { trackMobileIntroEvent } from "@/shared/lib/api/mobile-intro";

const slides = [
  { eyebrow: "ЗНАКОМСТВО", title: "ГАФУС — уверенность в каждом шаге!", text: "Лёгкое обучение начинается с понятной программы.\nВ ГАФУСе вы всегда понимаете, какой\nрезультат ожидать сегодня и что делать завтра.", image: require("../../assets/images/gafus-intro-hero-poster.png") },
  { eyebrow: "МАРШРУТ", title: "От проблемы к результату", text: "Не нужно самостоятельно искать советы и пытаться собрать из них систему. В ГАФУСе вас ждёт готовый пошаговый план под любую проблему. Просто выберите курс и начните.", image: require("../../assets/images/gafus-intro-route-poster.png") },
  { eyebrow: "КИНОЛОГ", title: "Не советы из интернета, а система от кинолога.", text: "Курсы разработаны профессиональным специалистом. Лана Петренко помогает выстраивать занятия бережно, понятно и с вниманием к состоянию животного. Член ассоциации поведенческой медицины RVBA, сертифицированный специалист Fear Free, основатель сервиса Campdog.", image: require("../../assets/images/gafus-intro-expert-poster.png") },
  { eyebrow: "СТОИМОСТЬ", title: "Не десятки тысяч, а по адекватной цене.", text: "Весь функционал ГАФУС — дешевле одной личной встречи с кинологом. И большинства онлайн-курсов.", image: require("../../assets/images/gafus-intro-pricing-poster.png") },
  { eyebrow: "ВОЗМОЖНОСТИ", title: "Всё о вашем хвостике — в одном месте", text: "Помимо курсов, в приложении можно хранить документы хвостика, делать записи о вет процедурах и ставить напоминания на любые события — всё это бесплатно.", image: require("../../assets/images/gafus-intro-features-poster.png") },
  { eyebrow: "ПЕРВЫЙ ШАГ", title: "А теперь настало время сделать первый шаг", text: "Создайте аккаунт и приступите к занятиям!", image: require("../../assets/images/gafus-intro-cta-poster.png") },
] as const;

export default function IntroScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const manual = useLocalSearchParams<{ manual?: string }>().manual === "1";
  const [state, setState] = useState<MobileIntroState>({ index: 0, finished: false });
  const [ready, setReady] = useState(false);
  const finishing = useRef(false);
  const latestState = useRef(state);
  const [leaving, setLeaving] = useState(false);
  const swipeStartY = useRef<number | null>(null);
  const swipeStartX = useRef<number | null>(null);
  const slide = slides[state.index];
  const isFinalSlide = state.index === slides.length - 1;

  useEffect(() => {
    let active = true;
    if (manual) {
      // A profile replay always starts at slide one and leaves first-run state alone.
      setReady(true);
      return;
    }
    void readMobileIntroState().catch(() => ({ index: 0, finished: false })).then((saved) => {
      if (!active) return;
      latestState.current = saved;
      setState(saved);
      setReady(true);
      if (!saved.finished) void trackMobileIntroEvent("OPENED").catch(() => undefined);
    });
    return () => { active = false; };
  }, [manual]);

  const finish = async (event: "SKIPPED" | "COMPLETED") => {
    if (finishing.current) return;
    finishing.current = true;
    setLeaving(true);
    if (manual) {
      if (router.canGoBack()) router.back();
      else router.replace("/");
      return;
    }
    await saveMobileIntroState({ ...latestState.current, finished: true }).catch(() => undefined);
    void trackMobileIntroEvent(event).catch(() => undefined);
    router.replace("/welcome");
  };
  const selectSlide = (index: number) => {
    if (finishing.current) return;
    const next = { ...latestState.current, index: Math.max(0, Math.min(slides.length - 1, index)) };
    latestState.current = next;
    setState(next);
    if (!manual) void saveMobileIntroState(next).catch(() => undefined);
  };
  const handleSwipeEnd = (event: GestureResponderEvent) => {
    if (swipeStartX.current === null || swipeStartY.current === null) return;
    const deltaX = event.nativeEvent.pageX - swipeStartX.current;
    const deltaY = event.nativeEvent.pageY - swipeStartY.current;
    swipeStartX.current = null;
    swipeStartY.current = null;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    selectSlide(latestState.current.index + (deltaX < 0 ? 1 : -1));
  };

  if (!ready) return null;
  if (state.finished && !manual) return <Redirect href="/welcome" />;
  return (
    <TexturedSafeAreaView style={styles.safe} edges={[]}>
      <Image
        source={slide.image}
        contentFit="cover"
        style={styles.posterBackground}
        accessibilityLabel={`${slide.eyebrow}. ${slide.title}. ${slide.text}`}
      />
      {!isFinalSlide && (
        <View style={[styles.top, { paddingTop: insets.top + SPACING.sm }]}>
          <Text style={styles.brand}>ГАФУС</Text>
          <Pressable onPress={() => void finish("SKIPPED")} disabled={leaving} accessibilityRole="button" style={styles.skipButton}>
            <Text style={styles.skip}>Пропустить</Text>
          </Pressable>
        </View>
      )}
      {isFinalSlide ? (
        <View style={[styles.finalContent, { paddingBottom: insets.bottom + SPACING.sm }]}>
          <Button label="Перейти к приложению" onPress={() => void finish("COMPLETED")} disabled={leaving} loading={leaving} style={styles.finalButton} />
        </View>
      ) : (
        <View
          style={styles.posterGestureLayer}
          onTouchStart={(event) => { swipeStartX.current = event.nativeEvent.pageX; swipeStartY.current = event.nativeEvent.pageY; }}
          onTouchCancel={() => { swipeStartX.current = null; swipeStartY.current = null; }}
          onTouchEnd={handleSwipeEnd}
        />
      )}
      <View
        style={[styles.bottom, { paddingBottom: insets.bottom + SPACING.md }]}
        pointerEvents="box-none"
      >
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>{slide.eyebrow}</Text>
            <Text style={styles.progressCount}>{state.index + 1} из {slides.length}</Text>
          </View>
          <View style={styles.stepper}>
            <View style={styles.stepperLine} pointerEvents="none" />
          {slides.map((item, index) => (
            <Pressable
              key={item.title}
              onPress={() => selectSlide(index)}
              disabled={leaving}
              testID={`mobile-intro-slide-${index + 1}`}
              accessible
              accessibilityRole="button"
              accessibilityLabel={`Слайд ${index + 1} из ${slides.length}: ${item.title}`}
              accessibilityHint="Открыть этот слайд"
              accessibilityState={{ selected: index === state.index }}
              style={({ pressed }) => [styles.stepButton, pressed && styles.stepButtonPressed]}
            >
              <View style={[styles.stepDot, index === state.index && styles.activeStepDot]}>
                <Text style={[styles.stepNumber, index === state.index && styles.activeStepNumber]}>{index + 1}</Text>
              </View>
            </Pressable>
          ))}
          </View>
        </View>
      </View>
    </TexturedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background, overflow: "hidden" },
  posterBackground: { ...StyleSheet.absoluteFillObject },
  top: { zIndex: 2, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  brand: { color: COLORS.primary, fontFamily: FONTS.impact, fontSize: 25 },
  skipButton: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: "rgba(91, 88, 35, 0.24)", backgroundColor: "rgba(255, 249, 230, 0.52)" },
  skip: { color: COLORS.textSecondary, fontFamily: FONTS.montserratMedium, fontSize: 14 },
  posterGestureLayer: { flex: 1, zIndex: 1 },
  finalContent: { flex: 1, zIndex: 1, justifyContent: "flex-end", paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
  finalButton: { width: "100%" },
  bottom: { position: "relative", zIndex: 2, elevation: 2, padding: SPACING.md, gap: SPACING.md },
  progressCard: { width: "100%", gap: 8, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "rgba(255, 249, 230, 0.58)", borderWidth: 1, borderColor: "rgba(91, 88, 35, 0.14)", boxShadow: "0 5px 12px rgba(74, 73, 23, 0.10)" },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4 },
  progressLabel: { color: COLORS.primary, fontFamily: FONTS.montserratBold, fontSize: 10, letterSpacing: 1.2 },
  progressCount: { color: COLORS.textSecondary, fontFamily: FONTS.montserratMedium, fontSize: 12 },
  stepper: { position: "relative", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stepperLine: { position: "absolute", top: 21, left: 24, right: 24, height: 2, backgroundColor: "rgba(99, 97, 40, 0.22)" },
  stepButton: { zIndex: 1, flex: 1, minWidth: 0, height: 44, alignItems: "center", justifyContent: "center" },
  stepButtonPressed: { opacity: 0.68, transform: [{ scale: 0.94 }] },
  stepDot: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: "rgba(99, 97, 40, 0.22)", backgroundColor: "#F9F2DF" },
  activeStepDot: { width: 36, height: 36, borderRadius: 18, borderColor: COLORS.primary, backgroundColor: COLORS.primary, boxShadow: "0 3px 7px rgba(74, 73, 23, 0.28)" },
  stepNumber: { color: COLORS.textSecondary, fontFamily: FONTS.montserratBold, fontSize: 12 },
  activeStepNumber: { color: "#FFF8E5", fontSize: 14 },
});
