import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Button } from "@/shared/components/ui/Button";
import { COLORS, FONTS } from "@/shared/config";
import type { WalkLocationDisclosureDetails } from "./walkLocationPermissionFlow";

export function WalkLocationDisclosure({
  details,
  onDecision,
}: {
  details: WalkLocationDisclosureDetails;
  onDecision: (confirmed: boolean) => void;
}) {
  return (
    <Modal transparent onRequestClose={() => onDecision(false)}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content}>
            <Text accessibilityRole="header" style={styles.title}>
              Запись маршрута прогулки
            </Text>
            <Text style={styles.body}>
              GAFUS собирает данные о местоположении, в том числе в фоновом режиме, чтобы записывать
              маршрут прогулки с собакой, даже когда приложение свёрнуто или экран телефона
              заблокирован.
            </Text>
            <Text style={styles.body}>
              Запись маршрута запускается пользователем во время прогулки и останавливается при её
              завершении.
            </Text>
            <Text style={styles.body}>
              Координаты сохраняются на телефоне. После завершения прогулки приложение
              синхронизирует маршрут с вашей учётной записью на сервере GAFUS. Для показа карты
              приложение запрашивает у её поставщика данные нужного участка.
            </Text>
            <Text style={styles.body}>
              Вы можете отказаться от доступа к геолокации. Таймер прогулки и подсчёт шагов
              останутся доступны.
            </Text>
            {details === "app-settings" ? (
              <Text style={styles.body}>
                Откроются настройки GAFUS. В разделе «Разрешения» откройте «Местоположение» и
                выберите «Разрешать всегда».
              </Text>
            ) : details === "background-settings" ? (
              <Text style={styles.body}>
                Если Android откроет настройки, выберите для местоположения «Разрешать всегда».
              </Text>
            ) : null}
            <Button label="Продолжить" onPress={() => onDecision(true)} />
            <Button label="Не сейчас" variant="outline" onPress={() => onDecision(false)} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  card: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "100%",
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: COLORS.cardBackground,
  },
  content: { padding: 20, gap: 12 },
  title: { color: COLORS.primaryDark, fontFamily: FONTS.montserratBold, fontSize: 20 },
  body: { color: COLORS.text, fontSize: 15, lineHeight: 21 },
});
