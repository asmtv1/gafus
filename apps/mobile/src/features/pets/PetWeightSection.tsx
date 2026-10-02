import { useMemo, useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Text } from "react-native-paper";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS, FONTS } from "@/shared/config";
import { Button } from "@/shared/components/ui/Button";
import { petWeightApi, type PetWeightEntry } from "@/shared/lib/api/pets";
import { reportClientError } from "@/shared/lib/tracer";
import petWeightIcon from "../../../assets/images/pet-weight-icon.png";

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);
const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
const today = () => {
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    day: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
  };
};

export function PetWeightSection({ petId }: { petId: string }) {
  const queryClient = useQueryClient();
  const key = ["pet-weight", petId];
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const result = await petWeightApi.get(petId);
      if (!result.success || !result.data)
        throw new Error(result.error || "Не удалось загрузить вес");
      return result.data;
    },
  });
  const [period, setPeriod] = useState<"3m" | "1y" | "all">("1y");
  const [mode, setMode] = useState<"weight" | "goal" | null>(null);
  const [weight, setWeight] = useState("");
  const [goal, setGoal] = useState("");
  const [day, setDay] = useState(() => today().day);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const visible = useMemo(() => {
    if (!data) return [];
    if (period === "all") return data.entries;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - (period === "3m" ? 3 : 12));
    return data.entries.filter((entry) => new Date(entry.measuredAt) >= cutoff);
  }, [data, period]);
  const latest = data?.entries.at(-1);
  const first = visible[0];
  const last = visible.at(-1);
  const values = visible.map((entry) => entry.weightKg);
  if (data?.targetWeightKg != null) values.push(data.targetWeightKg);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const pad = Math.max((max - min) * 0.2, 0.5);
  const y = (value: number) => 145 - ((value - min + pad) / (max - min + pad * 2)) * 120;
  const x = (entry: PetWeightEntry) =>
    first && last && first !== last
      ? 18 +
        ((new Date(entry.measuredAt).getTime() - new Date(first.measuredAt).getTime()) /
          Math.max(1, new Date(last.measuredAt).getTime() - new Date(first.measuredAt).getTime())) *
          284
      : 160;
  const points = visible.map((entry) => `${x(entry)},${y(entry.weightKg)}`).join(" ");

  async function save(action: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    setMessage("");
    try {
      const result = await action();
      if (!result.success) throw new Error(result.error || "Не удалось сохранить данные");
      await queryClient.invalidateQueries({ queryKey: key });
      await queryClient.invalidateQueries({ queryKey: ["pets"] });
      setMode(null);
      setWeight("");
    } catch (e) {
      reportClientError(e instanceof Error ? e : new Error(String(e)), {
        issueKey: "PetWeight",
        keys: { operation: "save", petId },
      });
      setMessage(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }
  const inputStyle = {
    backgroundColor: "#fff",
    borderColor: "#cfc5ad",
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    minHeight: 46,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  } as const;
  const actionStyle = {
    backgroundColor: "#ece5d2",
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center" as const,
  };
  return (
    <View
      style={{ backgroundColor: "#FFFDF8", borderRadius: 15, padding: 12, gap: 12, shadowColor: "#433317", shadowOpacity: 0.07, shadowRadius: 13, elevation: 2 }}
    >
      <View
        style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <Image source={petWeightIcon} style={{ width: 35, height: 35 }} contentFit="contain" />
          <Text style={{ fontFamily: FONTS.montserratBold, fontSize: 19, color: COLORS.text }}>
            Вес
          </Text>
        </View>
        {(latest || data?.currentWeightKg != null) && (
          <Text style={{ fontFamily: FONTS.montserratBold, fontSize: 24, color: COLORS.text }}>
            {fmt(latest?.weightKg ?? data!.currentWeightKg!)} кг
          </Text>
        )}
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {(
          [
            ["3m", "3 мес"],
            ["1y", "Год"],
            ["all", "Всё"],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setPeriod(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: period === value }}
            style={{
              backgroundColor: period === value ? COLORS.primary : "#ece5d2",
              borderRadius: 9,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text
              style={{
                color: period === value ? COLORS.onPrimary : COLORS.text,
                fontFamily: FONTS.montserratMedium,
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {visible.length ? (
        <View>
          <Svg
            width="100%"
            height={166}
            viewBox="0 0 320 166"
            accessibilityLabel={`График веса: ${visible.length} измерений`}
          >
            <Line x1={18} x2={302} y1={147} y2={147} stroke="#d5cbb2" />
            {data?.targetWeightKg != null && (
              <>
                <Line
                  x1={18}
                  x2={302}
                  y1={y(data.targetWeightKg)}
                  y2={y(data.targetWeightKg)}
                  stroke="#79964a"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />
                <SvgText
                  x={22}
                  y={Math.max(15, y(data.targetWeightKg) - 7)}
                  fill="#4b672a"
                  fontSize="11"
                >
                  Цель {fmt(data.targetWeightKg)} кг
                </SvgText>
              </>
            )}
            {visible.length > 1 && (
              <Polyline
                points={points}
                fill="none"
                stroke={COLORS.primary}
                strokeWidth={3}
                strokeLinejoin="round"
              />
            )}
            {visible.map((entry, index) => (
              <Circle
                key={entry.id}
                cx={x(entry)}
                cy={y(entry.weightKg)}
                r={index === visible.length - 1 ? 6 : 4}
                fill={index === visible.length - 1 ? "#b98b25" : COLORS.cardBackground}
                stroke={COLORS.primary}
                strokeWidth={2}
              />
            ))}
          </Svg>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>
              {first &&
                new Intl.DateTimeFormat("ru-RU", { month: "short", year: "numeric" }).format(
                  new Date(first.measuredAt),
                )}
            </Text>
            <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>
              {last &&
                new Intl.DateTimeFormat("ru-RU", { month: "short", year: "numeric" }).format(
                  new Date(last.measuredAt),
                )}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={{ color: COLORS.textSecondary }}>
          За этот период измерений нет. Запишите вес, чтобы увидеть изменение.
        </Text>
      )}
      {data?.targetWeightKg != null && latest && (
        <Text style={{ color: COLORS.primaryDark, fontFamily: FONTS.montserratMedium }}>
          {" "}
          {latest.weightKg === data.targetWeightKg
            ? "Целевой вес достигнут"
            : `До цели ${fmt(Math.abs(latest.weightKg - data.targetWeightKg))} кг · ${latest.weightKg > data.targetWeightKg ? "снижение" : "набор"} веса`}
        </Text>
      )}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          label="Записать вес"
          variant="primary"
          flex={1}
          fullWidth={false}
          onPress={() => {
            setMode(mode === "weight" ? null : "weight");
            setMessage("");
          }}
        />
        <Pressable
          onPress={() => {
            setGoal(data?.targetWeightKg == null ? "" : String(data.targetWeightKg));
            setMode(mode === "goal" ? null : "goal");
            setMessage("");
          }}
          style={actionStyle}
        >
          <Text style={{ color: COLORS.primaryDark, fontFamily: FONTS.montserratBold }}>Цель</Text>
        </Pressable>
      </View>
      {mode === "weight" && (
        <View style={{ gap: 9 }}>
          <Text>Вес, кг</Text>
          <TextInput
            keyboardType="decimal-pad"
            value={weight}
            onChangeText={setWeight}
            placeholder="Например, 24,3"
            style={inputStyle}
          />
          <Text>Дата (ГГГГ-ММ-ДД)</Text>
          <TextInput
            value={day}
            onChangeText={setDay}
            placeholder="2026-09-28"
            style={inputStyle}
          />
          <Button
            label="Сохранить"
            variant="primary"
            disabled={busy}
            onPress={() => {
              const value = Number(weight.replace(",", "."));
              const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
              const date =
                match
                  ? new Date(
                      Number(match[1]),
                      Number(match[2]) - 1,
                      Number(match[3]),
                      12,
                    )
                  : null;
              if (
                !Number.isFinite(value) ||
                value < 0.1 ||
                value > 200 ||
                !date ||
                date.getFullYear() !== Number(match?.[1]) ||
                date.getMonth() !== Number(match?.[2]) - 1 ||
                date.getDate() !== Number(match?.[3]) ||
                day > today().day
              ) {
                setMessage("Проверьте вес и дату измерения");
                return;
              }
              void save(() => petWeightApi.add(petId, value, (day === today().day ? new Date() : date).toISOString()));
            }}
          />
        </View>
      )}
      {mode === "goal" && (
        <View style={{ gap: 9 }}>
          <Text>Целевой вес, кг</Text>
          <TextInput
            keyboardType="decimal-pad"
            value={goal}
            onChangeText={setGoal}
            placeholder="Оставьте пустым, чтобы убрать цель"
            style={inputStyle}
          />
          <Button
            label="Сохранить цель"
            variant="primary"
            disabled={busy}
            onPress={() => {
              const value = goal.trim() ? Number(goal.replace(",", ".")) : null;
              if (value != null && (!Number.isFinite(value) || value < 0.1 || value > 200)) {
                setMessage("Введите целевой вес от 0,1 до 200 кг");
                return;
              }
              void save(() => petWeightApi.setTarget(petId, value));
            }}
          />
        </View>
      )}
      {isLoading && <Text>Загрузка веса…</Text>}
      {error && (
        <Pressable onPress={() => void refetch()}>
          <Text style={{ color: COLORS.error }}>
            Не удалось загрузить вес. Нажмите, чтобы повторить.
          </Text>
        </Pressable>
      )}
      {!!message && <Text style={{ color: COLORS.error }}>{message}</Text>}
      {!!data?.entries.length && (
        <View style={{ gap: 2, paddingTop: 8 }}>
          <Text style={{ fontFamily: FONTS.montserratBold, color: COLORS.text }}>Измерения</Text>
          {[...data.entries].reverse().map((entry) => (
            <View
              key={entry.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                borderTopWidth: 1,
                borderTopColor: "#e7dfcc",
                paddingVertical: 10,
              }}
            >
              <Text style={{ flex: 1, fontSize: 12, color: COLORS.text }}>
                {dateLabel(entry.measuredAt)}
              </Text>
              <Text style={{ fontFamily: FONTS.montserratBold, fontSize: 13, color: COLORS.text }}>
                {fmt(entry.weightKg)} кг
              </Text>
              <Pressable
                accessibilityLabel={`Удалить измерение от ${dateLabel(entry.measuredAt)}`}
                disabled={busy}
                onPress={() =>
                  Alert.alert("Удалить измерение?", "", [
                    { text: "Отмена", style: "cancel" },
                    {
                      text: "Удалить",
                      style: "destructive",
                      onPress: () => {
                        void save(() => petWeightApi.remove(petId, entry.id));
                      },
                    },
                  ])
                }
                style={{ padding: 4 }}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={19} color={COLORS.error} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
