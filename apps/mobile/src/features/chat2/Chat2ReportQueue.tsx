import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View, StyleSheet } from "react-native";
import { reportClientError } from "@/shared/lib/tracer";
import { chat2, type Chat2Report } from "./api";

/** Opens only from moderator room settings. API enforces group membership and role. */
export function Chat2ReportQueue({ id, open }: { id: string; open: boolean }) {
  const [reports, setReports] = useState<Chat2Report[]>([]);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (!open) {
      setReports([]);
      return;
    }
    let live = true;
    setLoading(true);
    setError("");
    void chat2
      .reports(id)
      .then((items) => {
        if (live) setReports(items);
      })
      .catch(() => {
        if (live) {
          setError("Не удалось получить жалобы");
          reportClientError(new Error("CHAT2_REPORT_QUEUE_FAILED"), {
            issueKey: "Chat2ReportQueue",
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
  }, [id, open]);
  function decide(reportId: string, status: "RESOLVED" | "REJECTED") {
    if (busy) return;
    Alert.alert(
      "Решение по жалобе",
      status === "RESOLVED" ? "Отметить жалобу как обработанную?" : "Отклонить жалобу?",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Подтвердить",
          onPress: () => {
            setBusy(true);
            setError("");
            setNotice("");
            void chat2
              .resolveReport(id, reportId, status)
              .then(() => {
                setReports((list) => list.filter((item) => item.id !== reportId));
                setNotice("Решение сохранено");
              })
              .catch(() => {
                setError("Не удалось сохранить решение");
                reportClientError(new Error("CHAT2_REPORT_DECISION_FAILED"), {
                  issueKey: "Chat2ReportQueue",
                  keys: { operation: "decision" },
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
      <Text style={styles.heading}>Жалобы участников</Text>
      {loading && <Text style={styles.meta}>Загружаем…</Text>}
      {!!error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      {!!notice && <Text style={styles.meta}>{notice}</Text>}
      {!loading && !error && reports.length === 0 && (
        <Text style={styles.meta}>Новых жалоб нет</Text>
      )}
      {reports.map((report) => (
        <View style={styles.item} key={report.id}>
          <Text style={styles.reason}>
            {report.reason === "SPAM"
              ? "Спам"
              : report.reason === "ABUSE"
                ? "Оскорбления"
                : "Другое"}
          </Text>
          <Text style={styles.meta}>{new Date(report.createdAt).toLocaleString("ru-RU")}</Text>
          {!!report.comment && <Text style={styles.comment}>{report.comment}</Text>}
          <Text style={styles.quote}>
            {report.message.deletedAt ? "Сообщение удалено" : report.message.text.slice(0, 1000)}
          </Text>
          <View style={styles.actions}>
            <Pressable
              style={styles.button}
              disabled={busy}
              onPress={() => decide(report.id, "RESOLVED")}
            >
              <Text style={styles.buttonText}>Обработано</Text>
            </Pressable>
            <Pressable
              style={styles.button}
              disabled={busy}
              onPress={() => decide(report.id, "REJECTED")}
            >
              <Text style={styles.buttonText}>Отклонить</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { marginTop: 16, marginBottom: 16, borderTopColor: "#e0e6d9", borderTopWidth: 1 },
  heading: { fontSize: 16, color: "#485d35", fontWeight: "700", marginVertical: 10 },
  meta: { fontSize: 11, color: "#849176", marginVertical: 4 },
  error: { fontSize: 12, color: "#b24c3c" },
  item: { padding: 10, borderRadius: 10, borderColor: "#dde6d4", borderWidth: 1, marginBottom: 9 },
  reason: { fontSize: 13, fontWeight: "700", color: "#4e6840" },
  comment: { fontSize: 12, color: "#5f6d55", marginTop: 5 },
  quote: {
    borderLeftColor: "#9aae84",
    borderLeftWidth: 3,
    paddingLeft: 8,
    marginVertical: 9,
    fontSize: 12,
    color: "#3b4633",
  },
  actions: { flexDirection: "row", gap: 9, flexWrap: "wrap" },
  button: { backgroundColor: "#eef3e7", padding: 10, borderRadius: 9 },
  buttonText: { color: "#5f744a", fontSize: 12, fontWeight: "600" },
});
