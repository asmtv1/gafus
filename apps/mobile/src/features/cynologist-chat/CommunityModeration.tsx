import { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CommunityModerationDto } from "@gafus/consultation-shared";
import { chatApi } from "@/shared/lib/api/cynologistChat";
import { Button } from "@/shared/components/ui/Button";
import { TexturedSafeAreaView } from "@/shared/components/TexturedSafeAreaView";
import { COLORS, FONTS } from "@/shared/config";
export default function CommunityModeration() {
  const [open, setOpen] = useState(false),
    [data, setData] = useState<CommunityModerationDto | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{
    action: "delete" | "ban" | "unban";
    messageId?: string;
    userId?: string;
    label: string;
  } | null>(null);
  async function load(older = false) {
    setBusy(true);
    setError("");
    try {
      const next = await chatApi<CommunityModerationDto>("moderation", {
        community: true,
        cursor: older ? (data?.cursor ?? undefined) : undefined,
      });
      setData((prev) =>
        older && prev ? { ...next, messages: [...prev.messages, ...next.messages] } : next,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      const { label, ...body } = confirm;
      await chatApi("moderation", { community: true, method: "POST", body });
      setConfirm(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        label="Модерация общего чата"
        variant="outline"
        onPress={() => {
          setOpen(true);
          void load();
        }}
      />
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => {
          if (!busy) setOpen(false);
        }}
      >
        <TexturedSafeAreaView style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>Модерация общего чата</Text>
            <Button
              label="Закрыть"
              variant="outline"
              disabled={busy}
              onPress={() => {
                setConfirm(null);
                setOpen(false);
              }}
            />
            {error && <Text accessibilityRole="alert">{error}</Text>}
            {busy && <Text>Загрузка…</Text>}
            {confirm && (
              <View style={styles.card}>
                <Text>{confirm.label}</Text>
                <Button
                  label="Подтвердить"
                  variant="danger"
                  disabled={busy}
                  onPress={() => void apply()}
                />
                <Button
                  label="Отмена"
                  variant="outline"
                  disabled={busy}
                  onPress={() => setConfirm(null)}
                />
              </View>
            )}
            {!confirm && (
              <>
                <Button
                  label="Обновить"
                  variant="outline"
                  disabled={busy}
                  onPress={() => void load()}
                />
                <Text style={styles.title}>Заблокированные участники</Text>
                {data?.bans.length === 0 && <Text>Нет заблокированных участников.</Text>}
                {data?.bans.map((user) => (
                  <View key={user.userId} style={styles.card}>
                    <Text>@{user.username}</Text>
                    <Button
                      label="Снять бан"
                      disabled={busy}
                      onPress={() =>
                        setConfirm({
                          action: "unban",
                          userId: user.userId,
                          label: `Снять бан с @${user.username}?`,
                        })
                      }
                    />
                  </View>
                ))}
                <Text style={styles.title}>Сообщения</Text>
                {data?.messages.length === 0 && <Text>Сообщений пока нет.</Text>}
                {data?.messages.map((message) => (
                  <View key={message.id} style={styles.card}>
                    <Text>@{message.username}</Text>
                    <Text numberOfLines={4}>{message.text}</Text>
                    <Button
                      label="Удалить сообщение"
                      variant="danger"
                      disabled={busy}
                      onPress={() =>
                        setConfirm({
                          action: "delete",
                          messageId: message.id,
                          label: "Удалить это сообщение из общего чата?",
                        })
                      }
                    />
                    {message.username !== "admin" && (
                      <Button
                        label="Заблокировать участника"
                        variant="outline"
                        disabled={busy}
                        onPress={() =>
                          setConfirm({
                            action: "ban",
                            userId: message.userId,
                            label: `Заблокировать @${message.username} в общем чате?`,
                          })
                        }
                      />
                    )}
                  </View>
                ))}
                {data?.cursor && (
                  <Button
                    label="Загрузить предыдущие сообщения"
                    disabled={busy}
                    onPress={() => void load(true)}
                  />
                )}
              </>
            )}
          </ScrollView>
        </TexturedSafeAreaView>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12 },
  title: { fontFamily: FONTS.montserratBold, fontSize: 20, color: COLORS.primary },
  card: {
    padding: 12,
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.cardBackground,
  },
});
