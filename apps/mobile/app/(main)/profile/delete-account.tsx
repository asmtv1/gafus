import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BORDER_RADIUS, COLORS, SPACING } from "@/shared/config";
import { Button, Card, Input } from "@/shared/components/ui";
import { userApi } from "@/shared/lib/api/user";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { useAuthStore } from "@/shared/stores";

const ACCOUNT_DELETION_WEB_URL = process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL?.trim() ?? "";
const CODE_RE = /^[0-9]{6}$/;
type DeletePhase = "start" | "requesting" | "code" | "review" | "submitting" | "unknown" | "deleted";
type Owner = { ownerId: string; username: string; authEpoch: string };

/** Next parity: email challenge -> six digits -> typed username + explicit
 * acknowledgement -> exactly one original Hono /account/delete POST.
 * Network/5xx/429 replies are ambiguous, so never silently retry them.
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const authUser = useAuthStore(s => s.user);
  const authenticated = useAuthStore(s => s.isAuthenticated);
  const authLoading = useAuthStore(s => s.isLoading);
  const ownerId = authenticated && !authLoading ? authUser?.id ?? null : null;
  const username = authUser?.username ?? "";
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = ownerId && binding?.principalId === ownerId ? binding.authEpoch : null;
  const mounted = useRef(true);
  const operation = useRef<"idle" | "code" | "delete">("idle");
  const deleteAttempted = useRef(false);
  const [phase, setPhase] = useState<DeletePhase>("start");
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");

  const isCurrent = (actor: Owner) => {
    const a = useAuthStore.getState();
    const verified = newOnlyV2NativeQueues.getVerifiedBinding();
    return mounted.current && a.isAuthenticated && !a.isLoading &&
      a.user?.id === actor.ownerId && a.user?.username === actor.username &&
      verified?.principalId === actor.ownerId && verified.authEpoch === actor.authEpoch;
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    // Do not let a new owner/epoch inherit old code, typed confirmation or ACK.
    operation.current = "idle";
    deleteAttempted.current = false;
    setPhase("start"); setCode(""); setTyped(""); setConsent(false); setMessage("");
  }, [ownerId, epoch, username]);

  const verified = !!ownerId && !!epoch && !!username;
  const { data: profile, isPending: profilePending, isError: profileError } = useQuery({
    queryKey: ["user-profile", "account-delete", ownerId, epoch],
    enabled: verified,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      if (!ownerId || !epoch || !username) throw Error("ACCOUNT_OWNER_UNVERIFIED");
      const actor: Owner = { ownerId, authEpoch: epoch, username };
      if (!isCurrent(actor)) throw Error("ACCOUNT_OWNER_CHANGED");
      const result = await userApi.getProfile(() => isCurrent(actor));
      if (!isCurrent(actor)) throw Error("ACCOUNT_OWNER_CHANGED");
      if (!result.success || result.data?.id !== ownerId)
        throw Error("ACCOUNT_PROFILE_UNAVAILABLE");
      return result.data;
    },
  });
  const email = profile?.email?.trim() ?? "";

  const onRequestCode = async () => {
    if (!ownerId || !epoch || !username || !email || phase !== "start" ||
      operation.current !== "idle") return;
    const actor: Owner = { ownerId, username, authEpoch: epoch };
    if (!isCurrent(actor)) return;
    operation.current = "code"; setPhase("requesting"); setMessage("");
    try {
      const result = await userApi.requestAccountDeletionCode(() => isCurrent(actor));
      if (!isCurrent(actor)) return;
      if (!result.success) {
        setPhase("unknown");
        setMessage("Результат запроса кода неизвестен. Проверьте почту. Повторная отправка заблокирована.");
        return;
      }
      hapticFeedback.success();
      setPhase("code"); setMessage("Код отправлен на email аккаунта (действует 15 минут).");
    } catch {
      if (!isCurrent(actor)) return;
      reportClientError(new Error("ACCOUNT_DELETE_CODE_RESULT_UNKNOWN"), {
        issueKey: "DeleteAccount", keys: { operation: "requestCode" },
      });
      setPhase("unknown");
      setMessage("Результат запроса кода неизвестен. Проверьте почту. Повторная отправка заблокирована.");
    } finally {
      if (isCurrent(actor)) operation.current = "idle";
    }
  };

  const onDelete = async () => {
    if (!ownerId || !epoch || !username || !CODE_RE.test(code) ||
      phase !== "review" || !consent || typed !== username ||
      operation.current !== "idle" || deleteAttempted.current) return;
    const actor: Owner = { ownerId, username, authEpoch: epoch };
    if (!isCurrent(actor)) return;
    deleteAttempted.current = true;
    operation.current = "delete"; setPhase("submitting"); setMessage("");
    try {
      const result = await userApi.deleteAccount(code, () => isCurrent(actor));
      if (!isCurrent(actor)) return;
      if (!result.success) {
        // The original API explicitly confirms a bad/expired code. Only that
        // definitely rejected request permits a NEW explicit attempt.
        if (result.error?.startsWith("Неверный или просроченный код")) {
          deleteAttempted.current = false;
          setCode("");setTyped("");setConsent(false);setPhase("code");
          setMessage("Неверный или просроченный код. Проверьте письмо.");
        } else {
          setPhase("unknown");
          setMessage("Результат удаления неизвестен. Не повторяйте запрос. Проверьте вход или обратитесь в поддержку.");
        }
        return;
      }
      setCode(""); setTyped(""); setConsent(false); setPhase("deleted");
      hapticFeedback.success();
      // Original server deletion is confirmed. Existing auth store clears
      // SecureStore credentials and private user caches on sign-out.
      await useAuthStore.getState().logout();
    } catch {
      if (!isCurrent(actor)) return;
      reportClientError(new Error("ACCOUNT_DELETE_RESULT_UNKNOWN"), {
        issueKey: "DeleteAccount", keys: { operation: "submit" },
      });
      setCode("");setTyped("");setConsent(false);setPhase("unknown");
      setMessage("Результат удаления неизвестен. Не повторяйте запрос. Проверьте вход или обратитесь в поддержку.");
    } finally {
      if (isCurrent(actor)) operation.current = "idle";
    }
  };

  if (!verified) return <SafeAreaView style={styles.container} edges={["bottom"]}>
    <Text accessibilityRole="alert">Сессия изменилась или не подтверждена. Откройте профиль заново.</Text>
  </SafeAreaView>;
  if (profilePending) return <SafeAreaView style={styles.container} edges={["bottom"]}>
    <Text accessibilityRole="text">Проверяем email аккаунта…</Text>
  </SafeAreaView>;
  if (profileError) return <SafeAreaView style={styles.container} edges={["bottom"]}>
    <Text accessibilityRole="alert">Не удалось проверить email. Откройте профиль заново.</Text>
  </SafeAreaView>;
  if (!email) return <SafeAreaView style={styles.container} edges={["bottom"]}>
    <ScrollView contentContainerStyle={styles.scroll}><Card style={styles.card}><Card.Content>
      <Text variant="titleMedium" style={styles.cardTitle}>Удаление аккаунта</Text>
      <Text style={styles.hint}>
        Сначала укажите email в профиле для подтверждения кодом из письма.
      </Text>
      <Button label="Указать email" onPress={() => router.push("/profile/change-email")}
        style={styles.primaryBtn}/>
    </Card.Content></Card></ScrollView>
  </SafeAreaView>;

  return <SafeAreaView style={styles.container} edges={["bottom"]}>
    <ScrollView contentContainerStyle={styles.scroll}><Card style={styles.card}><Card.Content>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name="delete-outline" size={28} color={COLORS.error}/>
      </View>
      <Text variant="titleMedium" style={styles.cardTitle}>Удаление аккаунта</Text>
      <Text style={styles.warning}>
        Действие необратимо. Восстановить профиль и прогресс будет невозможно.
      </Text>
      <Text style={styles.bulletTitle}>Будут удалены или обезличены:</Text>
      <Text style={styles.bullet}>• профиль, контакты и настройки;</Text>
      <Text style={styles.bullet}>• прогресс тренировок и данные обучения;</Text>
      <Text style={styles.bullet}>• push-подписки, напоминания, сессии и токены.</Text>
      <Text style={styles.emailHint}>Код будет отправлен на: {email}</Text>
      <Text style={styles.codeHint}>Для удаления нужен шестизначный код из письма.</Text>
      {ACCOUNT_DELETION_WEB_URL ? <Pressable onPress={() => {
        void Linking.openURL(ACCOUNT_DELETION_WEB_URL);
      }} style={styles.linkWrap}>
        <Text style={styles.linkText}>Открыть ту же процедуру на сайте</Text>
      </Pressable> : null}
      {phase === "start" && <Button variant="outline" label="Отправить код на email"
        onPress={() => void onRequestCode()} style={styles.sendCodeButton}/>}
      {phase === "requesting" && <Text accessibilityRole="text">Отправка кода…</Text>}
      {phase === "code" && <>
        <Input label="Код из письма" value={code}
          onChangeText={text => {setCode(text.replace(/[^0-9]/g, "").slice(0, 6));setMessage("");}}
          placeholder="000000" keyboardType="number-pad" maxLength={6}
          autoComplete="one-time-code" style={styles.input}/>
        <Text style={styles.codeFieldHint}>
          Введите код и перейдите к последнему подтверждению.
        </Text>
        <Button label="Продолжить" disabled={!CODE_RE.test(code)}
          onPress={() => {if (CODE_RE.test(code)) {setPhase("review");setMessage("");}}}/>
      </>}
      {phase === "review" && <>
        <Text style={styles.errorBox} accessibilityRole="alert">
          Это окончательное удаление без возможности восстановления.
        </Text>
        <Input label="Введите логин для подтверждения" value={typed}
          onChangeText={setTyped} autoCapitalize="none" autoComplete="off"/>
        <Pressable accessibilityRole="checkbox" accessibilityState={{checked:consent}}
          onPress={() => setConsent(value => !value)}>
          <Text>{consent ? "☑" : "☐"} Я понимаю, что восстановить аккаунт невозможно.</Text>
        </Pressable>
        <Button label="Удалить навсегда" onPress={() => void onDelete()}
          disabled={!consent || typed !== username || !CODE_RE.test(code)}
          style={styles.dangerButton}/>
        <Button label="Вернуться к коду" variant="outline"
          onPress={() => {setPhase("code");setTyped("");setConsent(false);}}/>
      </>}
      {phase === "submitting" && <Text accessibilityRole="text">Подтверждаем удаление…</Text>}
      {phase === "deleted" && <Text accessibilityRole="text">Удаление подтверждено сервером.</Text>}
      {message ? <Text style={phase === "unknown" ? styles.errorBox : styles.successBox}
        accessibilityRole={phase === "unknown" ? "alert" : "text"}>{message}</Text> : null}
    </Card.Content></Card></ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  card: {
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(198, 40, 40, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  cardTitle: {
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  hint: {
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: SPACING.md,
  },
  primaryBtn: {
    marginTop: SPACING.sm,
  },
  warning: {
    marginBottom: SPACING.sm,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  bulletTitle: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
    fontWeight: "600",
    color: COLORS.text,
  },
  bullet: {
    color: COLORS.textSecondary,
    marginBottom: 4,
    lineHeight: 22,
    fontSize: 14,
  },
  emailHint: {
    marginTop: SPACING.md,
    color: COLORS.text,
    fontWeight: "500",
  },
  codeHint: {
    marginTop: SPACING.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  linkWrap: {
    marginVertical: SPACING.md,
  },
  linkText: {
    color: COLORS.secondary,
    textDecorationLine: "underline",
    fontSize: 15,
  },
  /** Как .secondaryBtn на web: белый фон, оливковая обводка, тёмный текст (outline). */
  sendCodeButton: {
    marginTop: SPACING.md,
    alignSelf: "stretch",
    width: "100%",
    minHeight: 48,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  successBox: {
    marginTop: SPACING.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#e8f5e9",
    color: "#2e7d32",
    fontSize: 14,
    lineHeight: 20,
  },
  errorBox: {
    marginTop: SPACING.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#fbe9e7",
    color: "#c62828",
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    marginTop: SPACING.md,
  },
  codeFieldHint: {
    marginTop: SPACING.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  errorText: {
    color: COLORS.error,
    marginTop: SPACING.sm,
    fontSize: 14,
  },
  dangerButton: {
    marginTop: SPACING.lg,
    backgroundColor: "#c62828",
  },
});
