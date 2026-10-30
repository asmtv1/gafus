import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View, StyleSheet } from "react-native";
import { reportClientError } from "@/shared/lib/tracer";
import { chat2, type StaffChat2Report } from "./api";

/** Staff-only native queue; only server current ADMIN/MODERATOR role authorizes the data. */
export function Chat2StaffQueue({ open }: { open: boolean }) {
  const [items, setItems] = useState<StaffChat2Report[]>([]),
    [loading, setLoading] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (!open) {
      setItems([]);
      return;
    }
    let live = true;
    setLoading(true);
    setError("");
    void chat2
      .staffReports()
      .then((data) => {
        if (live) setItems(data);
      })
      .catch(() => {
        if (live) {
          setError("Очередь недоступна");
          reportClientError(new Error("CHAT2_STAFF_REPORTS_FAILED"), {
            issueKey: "Chat2StaffQueue",
            keys: { operation: "read" },
          });
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [open]);
  function resolve(id: string, status: "RESOLVED" | "REJECTED") {
    if (busy) return;
    Alert.alert(
      "Решение по жалобе",
      status === "RESOLVED" ? "Пометить как обработанную?" : "Отклонить жалобу?",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Подтвердить",
          onPress: () => {
            setBusy(true);
            setError("");
            setNotice("");
            void chat2
              .resolveStaffReport(id, status)
              .then(() => {
                setItems((previous) => previous.filter((x) => x.id !== id));
                setNotice("Решение сохранено");
              })
              .catch(() => {
                setError("Не удалось сохранить решение");
                reportClientError(new Error("CHAT2_STAFF_RESOLVE_FAILED"), {
                  issueKey: "Chat2StaffQueue",
                  keys: { operation: "resolve" },
                });
              })
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }
  if (!open) return null;
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Модерация GAFUS</Text>
      <Text style={styles.helper}>
        Жалобы из личных и групповых переписок. Только для уполномоченных сотрудников.
      </Text>
      {loading && <Text style={styles.meta}>Загружаем жалобы…</Text>}
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {!!notice && <Text style={styles.meta}>{notice}</Text>}
      {!loading && !error && items.length === 0 && (
        <Text style={styles.meta}>Новых жалоб нет.</Text>
      )}
      {items.map((item) => (
        <View key={item.id} style={styles.item}>
          <Text style={styles.title}>
            {item.conversation.name ??
              (item.conversation.kind === "DIRECT" ? "Личный чат" : "Чат GAFUS")}
          </Text>
          <Text style={styles.meta}>
            {item.reason === "SPAM" ? "Спам" : item.reason === "ABUSE" ? "Оскорбления" : "Другое"} ·{" "}
            {new Date(item.createdAt).toLocaleString("ru-RU")}
          </Text>
          {!!item.comment && <Text style={styles.comment}>{item.comment}</Text>}
          <Text style={styles.quote}>
            {item.message.deletedAt ? "Сообщение удалено" : item.message.text.slice(0, 1000)}
          </Text>
          <View style={styles.actions}>
            <Pressable
              style={styles.button}
              disabled={busy}
              onPress={() => resolve(item.id, "RESOLVED")}
            >
              <Text style={styles.actionText}>Обработано</Text>
            </Pressable>
            <Pressable
              style={styles.button}
              disabled={busy}
              onPress={() => resolve(item.id, "REJECTED")}
            >
              <Text style={styles.actionText}>Отклонить</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { marginVertical: 12 },
  title: { fontSize: 16, color: "#495a36", fontWeight: "700", marginBottom: 5 },
  helper: { color: "#68755c", fontSize: 12, marginVertical: 7 },
  meta: { color: "#879073", fontSize: 11, marginVertical: 6 },
  error: { color: "#a94733", fontSize: 12 },
  item: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e1e6d8",
    borderRadius: 11,
    padding: 11,
    marginVertical: 7,
  },
  comment: { color: "#60724d", marginTop: 5, fontSize: 12 },
  quote: {
    fontSize: 12,
    color: "#37452f",
    borderLeftColor: "#9bac87",
    borderLeftWidth: 3,
    paddingLeft: 9,
    marginVertical: 10,
  },
  actions: { flexDirection: "row", gap: 9, flexWrap: "wrap" },
  button: { backgroundColor: "#eef3e7", padding: 10, borderRadius: 8 },
  actionText: { color: "#60774a", fontSize: 12, fontWeight: "600" },
});
