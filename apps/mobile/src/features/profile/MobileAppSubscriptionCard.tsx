import { useState } from "react";
import { View, Alert, Pressable } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { ProfileIcon } from "@/features/profile";
import { Button } from "@/shared/components/ui";
import { appSubscriptionApi, requestAppSubscriptionPaywall, useAppSubscriptionStatus } from "@/features/app-subscription";
import { COLORS, SPACING, FONTS } from "@/shared/config";
import { styles } from "./profileTabStyles";
function formatMskDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })} МСК`;
}


export function MobileAppSubscriptionCard() {
  const queryClient = useQueryClient();
  const [unlinkConfirmed, setUnlinkConfirmed] = useState(false);
  const { data: statusResponse, isLoading, refetch } = useAppSubscriptionStatus();
  const status = statusResponse?.data;
  const isActive = Boolean(status?.hasActiveSubscription);
  const canUnlink =
    isActive &&
    status?.provider === "YOOKASSA" &&
    Boolean(status.hasSavedPaymentMethod) &&
    !status.cancelAtPeriodEnd;

  const cancelMutation = useMutation({
    mutationFn: () => appSubscriptionApi.cancelYookassa(),
    onSuccess: async (result) => {
      if (!result.success) {
        Alert.alert("Не удалось удалить способ оплаты", result.error ?? "Попробуйте позже.");
        return;
      }
      setUnlinkConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: ["app-subscription"] });
      Alert.alert("Способ оплаты удалён", "Автопродление подписки отключено.");
    },
  });

  const handleUnlink = () => {
    if (!unlinkConfirmed) {
      Alert.alert("Подтвердите действие", "Поставьте чек-бокс, чтобы удалить способ оплаты.");
      return;
    }
    cancelMutation.mutate();
  };

  if (isLoading) {
    return (
      <View style={styles.subscriptionCard}>
        <View style={styles.subscriptionHeader}>
          <ProfileIcon name="premium" />
          <Text style={styles.subscriptionTitle}>Подписка Gafus Premium</Text>
        </View>
        <Text style={styles.subscriptionMuted}>Загружаем данные подписки...</Text>
      </View>
    );
  }

  if (!isActive) {
    return (
      <View style={styles.subscriptionCard}>
        <View style={styles.subscriptionHeader}>
          <ProfileIcon name="premium" />
          <Text style={styles.subscriptionTitle}>Подписка Gafus Premium</Text>
          <View style={[styles.subscriptionStatusBadge, styles.subscriptionStatusInactive]}>
            <Text style={[styles.subscriptionStatusText, { color: "#A83C24" }]}>Не активна</Text>
          </View>
        </View>
        <Text style={styles.subscriptionMuted}>
          Откройте больше возможностей для вас и вашего питомца.
        </Text>
        <View style={styles.subscriptionBenefits}>
          {[
            "Все курсы и тренировки",
            "Консультации с кинологом",
            "Документы питомца",
            "Эксклюзивные материалы",
          ].map((benefit) => (
            <View key={benefit} style={styles.subscriptionBenefit}>
              <MaterialCommunityIcons name="check-circle" size={22} color={COLORS.primary} />
              <Text style={styles.subscriptionBenefitText}>{benefit}</Text>
            </View>
          ))}
        </View>
        <Image
          source={require("../../../assets/images/profile-premium-mascot.png")}
          style={styles.subscriptionArt}
          contentFit="contain"
          accessible={false}
        />
        <Button
          label="Оформить подписку"
          height={48}
          fontFamily={FONTS.impact}
          fontSize={16}
          lineHeight={20}
          horizontalPadding={SPACING.md}
          verticalPadding={0}
          borderRadius={14}
          onPress={() => requestAppSubscriptionPaywall("required")}
        />
        <Button
          label="Обновить статус"
          variant="caramel"
          animatedPress
          height={48}
          onPress={() => void refetch()}
        />
      </View>
    );
  }

  const nextChargeLabel =
    status?.provider === "YOOKASSA" && status.hasSavedPaymentMethod && status.nextChargeAt
      ? formatMskDateTime(status.nextChargeAt)
      : status?.provider === "APPLE"
        ? "Управляется в App Store"
        : "Отключено";
  const paidLabel = status?.isTrial ? "Пробный период до" : "Оплачено";
  const paidValue = status?.isTrial
    ? formatMskDateTime(status.trialEndsAt)
    : formatMskDateTime(status?.paidAt);

  const isPartnerAccess =
    status?.provider === "MANUAL" &&
    status?.isLifetime &&
    status.paymentMethodTitle === "Партнёрская программа";

  return (
    <View style={styles.subscriptionCard}>
      <View style={styles.subscriptionHeader}>
        <ProfileIcon name="premium" />
        <Text style={styles.subscriptionTitle}>Подписка Gafus Premium</Text>
        <View style={styles.subscriptionStatusBadge}>
          <Text style={styles.subscriptionStatusText}>Активна</Text>
        </View>
      </View>

      {isPartnerAccess ? (
        <Text style={styles.subscriptionMuted}>
          Бесплатный бессрочный доступ участника партнёрской программы.
        </Text>
      ) : (
        <>
          <View style={styles.subscriptionGrid}>
            <View style={styles.subscriptionInfoCell}>
              <Text style={styles.subscriptionLabel}>{paidLabel}</Text>
              <Text style={styles.subscriptionValue}>{paidValue}</Text>
            </View>
            <View style={styles.subscriptionInfoCell}>
              <Text style={styles.subscriptionLabel}>Доступ до</Text>
              <Text style={styles.subscriptionValue}>{formatMskDateTime(status?.activeUntil)}</Text>
            </View>
            <View style={styles.subscriptionInfoCell}>
              <Text style={styles.subscriptionLabel}>Следующее списание</Text>
              <Text style={styles.subscriptionValue}>{nextChargeLabel}</Text>
            </View>
          </View>

          <View style={styles.subscriptionInfoCell}>
            <Text style={styles.subscriptionLabel}>Способ оплаты</Text>
            <Text style={styles.subscriptionValue}>
              {status?.paymentMethodLast4
                ? `•••• ${status.paymentMethodLast4}`
                : (status?.paymentMethodTitle ?? "—")}
            </Text>
          </View>
        </>
      )}

      {canUnlink ? (
        <>
          <View style={styles.subscriptionDivider} />
          <Pressable
            style={styles.subscriptionCheckRow}
            onPress={() => setUnlinkConfirmed((value) => !value)}
          >
            <View
              style={[
                styles.subscriptionCheckbox,
                unlinkConfirmed && styles.subscriptionCheckboxOn,
              ]}
            >
              {unlinkConfirmed ? (
                <MaterialCommunityIcons name="check" size={16} color="#ECE5D2" />
              ) : null}
            </View>
            <Text style={styles.subscriptionCheckText}>
              Подтверждаю отвязку способа оплаты и отключение автоплатежей по подписке.
            </Text>
          </Pressable>
          <Button
            label={cancelMutation.isPending ? "Удаляем..." : "Удалить способ оплаты"}
            variant="secondary"
            height={48}
            onPress={handleUnlink}
            disabled={!unlinkConfirmed || cancelMutation.isPending}
            loading={cancelMutation.isPending}
          />
        </>
      ) : (
        <Text style={styles.subscriptionMuted}>
          Автопродление включится после сохранения способа оплаты.
        </Text>
      )}
      <Button
        label="Обновить статус"
        variant="caramel"
        animatedPress
        height={48}
        onPress={() => void refetch()}
      />
    </View>
  );
}
